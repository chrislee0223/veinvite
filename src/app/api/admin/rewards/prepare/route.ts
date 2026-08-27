import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const ROUND_ID_PATTERN = /^\d+$/;
const PREPARE_INTENT =
  'PREPARE_REWARD_ROUND';

function requestHasSameOrigin(
  request: NextRequest,
): boolean {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function parseRoundId(
  value: unknown,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value);

  if (
    !ROUND_ID_PATTERN.test(normalized) ||
    BigInt(normalized) < 1n
  ) {
    throw new Error(
      'prepare_reward_round returned an invalid round id.',
    );
  }

  return BigInt(normalized).toString();
}

export async function POST(
  request: NextRequest,
) {
  if (!requestHasSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('intent' in body) ||
    body.intent !== PREPARE_INTENT
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${PREPARE_INTENT}.`,
      },
      { status: 400 },
    );
  }

  try {
    const session =
      await requireWalletSession({ request });
    const pool =
      await readVeInviteRewardPoolStatus();

    if (
      !canOperateVeInviteRewards(
        session.walletAddress,
        pool,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The verified wallet is not the VeInvite reward operator.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (pool.distributionPaused) {
      return NextResponse.json(
        {
          error:
            'VeInvite reward distribution is paused on-chain.',
          pool,
          roundCreated: false,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const openRoundResult =
      await supabaseAdmin
        .from('reward_rounds')
        .select('id, status')
        .eq('network', pool.network)
        .eq('app_id', pool.appId)
        .in('status', ['CREATED', 'PAYING'])
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (openRoundResult.error) {
      throw new Error(
        `Open reward round could not be checked: ${openRoundResult.error.message}`,
      );
    }

    if (openRoundResult.data) {
      return NextResponse.json(
        {
          error:
            'Finish the current reward round before preparing another one.',
          code: 'ACTIVE_REWARD_ROUND_EXISTS',
          activeRound: openRoundResult.data,
          pool,
          roundCreated: false,
          writesPerformed: false,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const { data, error } =
      await supabaseAdmin.rpc(
        'prepare_reward_round',
        {
          p_network: pool.network,
          p_app_id: pool.appId,
          p_pool_balance_wei:
            pool.effectiveRewardPoolWei,
        },
      );

    if (error) {
      throw new Error(
        `prepare_reward_round failed: ${error.message}`,
      );
    }

    const roundId = parseRoundId(data);

    if (!roundId) {
      return NextResponse.json(
        {
          roundCreated: false,
          reason:
            BigInt(pool.effectiveRewardPoolWei) === 0n
              ? 'NO_REWARD_POOL_BALANCE'
              : 'NO_SETTLEABLE_CANDIDATES_OR_AVAILABLE_BALANCE',
          pool,
          verifiedOperator:
            session.walletAddress,
          writesPerformed: false,
          transfersPerformed: false,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const [roundResult, payoutResult] =
      await Promise.all([
        supabaseAdmin
          .from('reward_rounds')
          .select(
            'id, network, app_id, status, observed_pool_balance_wei, reserved_before_round_wei, distributable_wei, eligible_count, per_reward_wei, remainder_wei, created_at',
          )
          .eq('id', roundId)
          .single(),
        supabaseAdmin
          .from('reward_payouts')
          .select(
            'id, invite_code, recipient_wallet, amount_wei, status',
          )
          .eq('round_id', roundId)
          .order('id', {
            ascending: true,
          }),
      ]);

    if (roundResult.error) {
      throw new Error(
        `Prepared reward round could not be reloaded: ${roundResult.error.message}`,
      );
    }

    if (payoutResult.error) {
      throw new Error(
        `Prepared reward payouts could not be reloaded: ${payoutResult.error.message}`,
      );
    }

    return NextResponse.json(
      {
        roundCreated: true,
        pool,
        verifiedOperator:
          session.walletAddress,
        round: roundResult.data,
        payouts: payoutResult.data ?? [],
        writesPerformed: true,
        transfersPerformed: false,
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (
      error instanceof WalletAuthenticationError
    ) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    console.error(
      'Failed to prepare VeInvite reward round:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite reward round could not be prepared.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
