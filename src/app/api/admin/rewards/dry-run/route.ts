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

type InvitationRewardRow = {
  invite_code: string;
  inviter_wallet: string;
  reward_eligible_at: string | null;
};

type RewardPayoutRow = {
  invite_code: string;
  amount_wei: number | string;
  status: RewardPayoutStatus;
};

const NON_NEGATIVE_INTEGER = /^\d+$/;

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

  const [
    invitationResult,
    payoutResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('invitations')
      .select(
        'invite_code, inviter_wallet, reward_eligible_at',
      )
      .eq('status', 'COMPLETED')
      .eq('reward_status', 'ELIGIBLE')
      .order('reward_eligible_at', {
        ascending: true,
        nullsFirst: false,
      })
      .order('invite_code', {
        ascending: true,
      }),

    supabaseAdmin
      .from('reward_payouts')
      .select(
        'invite_code, amount_wei, status',
      ),
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

  if (payoutResult.error) {
    console.error(
      'Reward dry-run failed to load existing payouts:',
      payoutResult.error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to load existing reward payouts.',
      },
      { status: 500 },
    );
  }

  try {
    const result = calculateRewardDryRun({
      poolBalanceWei,
      candidates: toCandidates(
        (invitationResult.data ?? []) as InvitationRewardRow[],
      ),
      existingPayouts: toExistingPayouts(
        (payoutResult.data ?? []) as RewardPayoutRow[],
      ),
    });

    return NextResponse.json(
      {
        mode: 'DRY_RUN',
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
