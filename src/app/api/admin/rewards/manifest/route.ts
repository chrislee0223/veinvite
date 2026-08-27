import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  buildPayoutManifest,
  type RewardPayoutForManifest,
  type RewardRoundForManifest,
} from '@/lib/rewards/payoutManifest';
import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const CREATE_MANIFEST_INTENT =
  'CREATE_PAYOUT_MANIFEST';
const ROUND_ID_PATTERN = /^\d+$/;

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

function readRoundId(body: unknown): string {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('roundId' in body)
  ) {
    throw new Error('roundId is required.');
  }

  const value = String(body.roundId);

  if (
    !ROUND_ID_PATTERN.test(value) ||
    BigInt(value) < 1n
  ) {
    throw new Error(
      'roundId must be a positive integer.',
    );
  }

  return BigInt(value).toString();
}

function parseManifestRpcResult(data: unknown) {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('manifest_id' in data) ||
    !('created' in data)
  ) {
    throw new Error(
      'create_reward_payout_manifest returned malformed data.',
    );
  }

  const manifestId = String(data.manifest_id);
  const created = data.created;

  if (
    !ROUND_ID_PATTERN.test(manifestId) ||
    BigInt(manifestId) < 1n ||
    typeof created !== 'boolean'
  ) {
    throw new Error(
      'create_reward_payout_manifest returned invalid values.',
    );
  }

  return {
    manifestId: BigInt(manifestId).toString(),
    created,
  };
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
    body.intent !== CREATE_MANIFEST_INTENT
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${CREATE_MANIFEST_INTENT}.`,
      },
      { status: 400 },
    );
  }

  let roundId: string;

  try {
    roundId = readRoundId(body);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid roundId.',
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

    const [roundResult, payoutResult] =
      await Promise.all([
        supabaseAdmin
          .from('reward_rounds')
          .select(
            'id, network, app_id, status, distributable_wei, eligible_count',
          )
          .eq('id', roundId)
          .maybeSingle(),
        supabaseAdmin
          .from('reward_payouts')
          .select(
            'id, invite_code, recipient_wallet, amount_wei, status, tx_id',
          )
          .eq('round_id', roundId)
          .order('id', {
            ascending: true,
          }),
      ]);

    if (roundResult.error) {
      throw new Error(
        `Failed to load reward round: ${roundResult.error.message}`,
      );
    }

    if (!roundResult.data) {
      return NextResponse.json(
        { error: 'Reward round not found.' },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (payoutResult.error) {
      throw new Error(
        `Failed to load reward payouts: ${payoutResult.error.message}`,
      );
    }

    if (
      String(roundResult.data.network) !==
      pool.network
    ) {
      return NextResponse.json(
        {
          error:
            'Reward round network does not match the active VeBetterDAO network.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const manifest = buildPayoutManifest({
      round:
        roundResult.data as RewardRoundForManifest,
      payouts:
        (payoutResult.data ?? []) as RewardPayoutForManifest[],
      x2EarnRewardsPoolAddress:
        pool.x2EarnRewardsPoolAddress,
    });

    const { data, error } =
      await supabaseAdmin.rpc(
        'create_reward_payout_manifest',
        {
          p_round_id: roundId,
          p_operator_wallet:
            session.walletAddress,
          p_pool_address:
            manifest.x2EarnRewardsPoolAddress,
          p_manifest_hash:
            manifest.manifestHash,
          p_clauses: manifest.clauses,
        },
      );

    if (error) {
      throw new Error(
        `create_reward_payout_manifest failed: ${error.message}`,
      );
    }

    const rpcResult =
      parseManifestRpcResult(data);

    const persistedResult =
      await supabaseAdmin
        .from('reward_payout_manifests')
        .select(
          'id, round_id, manifest_version, network, app_id, x2earn_rewards_pool_address, operator_wallet, manifest_hash, payout_count, total_amount_wei, created_at',
        )
        .eq('id', rpcResult.manifestId)
        .single();

    if (persistedResult.error) {
      throw new Error(
        `Created payout manifest could not be reloaded: ${persistedResult.error.message}`,
      );
    }

    if (
      String(persistedResult.data.manifest_hash) !==
        manifest.manifestHash ||
      String(persistedResult.data.round_id) !==
        manifest.roundId ||
      String(persistedResult.data.total_amount_wei) !==
        manifest.totalAmountWei ||
      Number(persistedResult.data.payout_count) !==
        manifest.payoutCount
    ) {
      throw new Error(
        'Persisted payout manifest does not match the generated financial plan.',
      );
    }

    return NextResponse.json(
      {
        manifestCreated: rpcResult.created,
        manifestId: rpcResult.manifestId,
        verifiedOperator:
          session.walletAddress,
        pool: {
          network: pool.network,
          appId: pool.appId,
          x2EarnRewardsPoolAddress:
            pool.x2EarnRewardsPoolAddress,
          contractVersion:
            pool.contractVersion,
          distributionPaused:
            pool.distributionPaused,
        },
        manifest,
        persisted: persistedResult.data,
        signatureRequired: true,
        transactionSubmitted: false,
        transfersPerformed: false,
      },
      {
        status: rpcResult.created ? 201 : 200,
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
      'Failed to create VeInvite payout manifest:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite payout manifest could not be created.',
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
