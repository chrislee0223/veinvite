import { timingSafeEqual } from 'crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  calculateRewardDryRun,
  type ExistingRewardPayout,
  type RewardCandidate,
  type RewardPayoutStatus,
} from '@/lib/rewards/dryRun';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

type InvitationRewardRow = {
  invite_code: string;
  inviter_wallet: string;
  reward_eligible_at: string | null;
};

type RewardRoundIdRow = {
  id: number | string;
};

type RewardPayoutRow = {
  invite_code: string;
  amount_wei: number | string;
  status: RewardPayoutStatus;
};

const NON_NEGATIVE_INTEGER = /^\d+$/;

// VeInvite uses the same bytes32 app id in the reviewed VeBetter environments.
// Keeping this explicit prevents a dry run for one app from reserving another
// app's payouts if a shared database is ever used for multiple pools.
const VEINVITE_APP_ID =
  '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';

function isProductionDeployment() {
  return process.env.VERCEL_ENV === 'production';
}

function secureEquals(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function authorizeDryRun(request: NextRequest) {
  const configuredSecret =
    process.env.VEINVITE_REWARD_DRY_RUN_SECRET;

  if (!configuredSecret) {
    return {
      ok: false as const,
      status: 503,
      error:
        'Reward dry-run secret is not configured.',
    };
  }

  const providedSecret =
    request.headers.get('x-veinvite-admin-secret');

  if (
    !providedSecret ||
    !secureEquals(
      providedSecret,
      configuredSecret,
    )
  ) {
    return {
      ok: false as const,
      status: 401,
      error: 'Unauthorized.',
    };
  }

  return { ok: true as const };
}

function toCandidates(
  rows: InvitationRewardRow[],
): RewardCandidate[] {
  return rows.map((row) => ({
    inviteCode: row.invite_code,
    recipientWallet: row.inviter_wallet,
    eligibleAt: row.reward_eligible_at,
  }));
}

function toExistingPayouts(
  rows: RewardPayoutRow[],
): ExistingRewardPayout[] {
  return rows.map((row) => ({
    inviteCode: row.invite_code,
    amountWei: String(row.amount_wei),
    status: row.status,
  }));
}

function parseRoundIds(
  rows: RewardRoundIdRow[],
): number[] {
  return rows.map((row) => {
    const id =
      typeof row.id === 'number'
        ? row.id
        : Number(row.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      throw new Error(
        'Reward dry-run encountered an invalid reward round id.',
      );
    }

    return id;
  });
}

export async function POST(
  request: NextRequest,
) {
  // Dry-run must never become an accidental production payout surface.
  if (isProductionDeployment()) {
    return NextResponse.json(
      {
        error:
          'Reward dry-run is disabled in Production.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const authorization =
    authorizeDryRun(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      {
        status: authorization.status,
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

  const poolBalanceWei =
    typeof body === 'object' &&
    body !== null &&
    'poolBalanceWei' in body &&
    typeof body.poolBalanceWei === 'string'
      ? body.poolBalanceWei
      : null;

  if (
    poolBalanceWei === null ||
    !NON_NEGATIVE_INTEGER.test(poolBalanceWei)
  ) {
    return NextResponse.json(
      {
        error:
          'poolBalanceWei must be a non-negative integer string.',
      },
      { status: 400 },
    );
  }

  const { network } =
    getVeBetterNetworkConfig();

  const [
    invitationResult,
    roundResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('invitations')
      .select(
        'invite_code, inviter_wallet, reward_eligible_at',
      )
      .eq('status', 'COMPLETED')
      .eq('reward_status', 'ELIGIBLE')
      .eq('activation_network', network)
      .order('reward_eligible_at', {
        ascending: true,
        nullsFirst: false,
      })
      .order('invite_code', {
        ascending: true,
      }),

    supabaseAdmin
      .from('reward_rounds')
      .select('id')
      .eq('network', network)
      .eq('app_id', VEINVITE_APP_ID),
  ]);

  if (invitationResult.error) {
    console.error(
      'Reward dry-run failed to load eligible invitations:',
      invitationResult.error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to load eligible invitations.',
      },
      { status: 500 },
    );
  }

  if (roundResult.error) {
    console.error(
      'Reward dry-run failed to load matching reward rounds:',
      roundResult.error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to load matching reward rounds.',
      },
      { status: 500 },
    );
  }

  let roundIds: number[];

  try {
    roundIds = parseRoundIds(
      (roundResult.data ?? []) as RewardRoundIdRow[],
    );
  } catch (error) {
    console.error(
      'Reward dry-run found malformed round data:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Reward dry-run round data failed validation.',
      },
      { status: 500 },
    );
  }

  let payoutRows: RewardPayoutRow[] = [];

  if (roundIds.length > 0) {
    const payoutResult =
      await supabaseAdmin
        .from('reward_payouts')
        .select(
          'invite_code, amount_wei, status',
        )
        .in('round_id', roundIds);

    if (payoutResult.error) {
      console.error(
        'Reward dry-run failed to load scoped payouts:',
        payoutResult.error,
      );

      return NextResponse.json(
        {
          error:
            'Failed to load scoped reward payouts.',
        },
        { status: 500 },
      );
    }

    payoutRows =
      (payoutResult.data ?? []) as RewardPayoutRow[];
  }

  try {
    const result = calculateRewardDryRun({
      poolBalanceWei,
      candidates: toCandidates(
        (invitationResult.data ?? []) as InvitationRewardRow[],
      ),
      existingPayouts: toExistingPayouts(
        payoutRows,
      ),
    });

    return NextResponse.json(
      {
        mode: 'DRY_RUN',
        network,
        appId: VEINVITE_APP_ID,
        writesPerformed: false,
        transfersPerformed: false,
        result,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Reward dry-run calculation failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Reward dry-run calculation failed validation.',
      },
      { status: 500 },
    );
  }
}
