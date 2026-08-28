import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  averageWei,
  buildRoundReportPosts,
  formatWeiAsB3tr,
  type RoundReport,
} from '@/lib/reporting/roundReport';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

type RewardRoundRow = {
  id: string | number;
  network: string;
  app_id: string;
  status: string;
  observed_pool_balance_wei: string;
  reserved_before_round_wei: string;
  distributable_wei: string;
  eligible_count: number;
  per_reward_wei: string;
  remainder_wei: string;
  created_at: string;
  completed_at: string | null;
};

type EligibilityRow = {
  wallet_address: string;
  outcome: string;
  entry_class: string | null;
};

type PayoutRow = {
  invite_code: string;
  recipient_wallet: string;
  amount_wei: string;
  status: string;
  paid_at: string | null;
};

type QueueRow = {
  invite_code: string;
  entry_class: string;
};

type WeeklyImpactRow = {
  successful_referrals_completed: number | string | null;
  paid_referral_rewards: number | string | null;
  rewarded_wallets: number | string | null;
  b3tr_distributed_wei: string | number | null;
};

function countDistinct(
  rows: EligibilityRow[],
  predicate: (row: EligibilityRow) => boolean,
): number {
  return new Set(
    rows
      .filter(predicate)
      .map((row) => row.wallet_address.toLowerCase()),
  ).size;
}

function toSafeCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Report count is not a safe non-negative integer.');
  }
  return parsed;
}

function toUnsignedIntegerString(value: unknown): string {
  const normalized = String(value ?? '0');
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Report amount is not an unsigned integer string.');
  }
  return BigInt(normalized).toString();
}

async function loadCompletedRound({
  network,
  appId,
  requestedRoundId,
}: {
  network: string;
  appId: string;
  requestedRoundId: string | null;
}): Promise<RewardRoundRow | null> {
  let query = supabaseAdmin
    .from('reward_rounds')
    .select(
      'id, network, app_id, status, observed_pool_balance_wei, reserved_before_round_wei, distributable_wei, eligible_count, per_reward_wei, remainder_wei, created_at, completed_at',
    )
    .eq('network', network)
    .eq('app_id', appId)
    .eq('status', 'COMPLETED');

  if (requestedRoundId) {
    query = query.eq('id', requestedRoundId);
  } else {
    query = query.order('id', { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(
      `Completed reward round could not be loaded: ${error.message}`,
    );
  }

  return (data as RewardRoundRow | null) ?? null;
}

async function loadPeriodStart({
  round,
}: {
  round: RewardRoundRow;
}): Promise<{
  periodStart: string | null;
  source: 'PREVIOUS_REWARD_ROUND' | 'LAUNCH_BASELINE' | 'MISSING';
}> {
  const previousRoundResult = await supabaseAdmin
    .from('reward_rounds')
    .select('id, created_at')
    .eq('network', round.network)
    .eq('app_id', round.app_id)
    .lt('created_at', round.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousRoundResult.error) {
    throw new Error(
      `Previous reward round could not be loaded: ${previousRoundResult.error.message}`,
    );
  }

  if (previousRoundResult.data?.created_at) {
    return {
      periodStart: previousRoundResult.data.created_at,
      source: 'PREVIOUS_REWARD_ROUND',
    };
  }

  const configResult = await supabaseAdmin
    .from('operator_reporting_config')
    .select('reporting_start_at, reporting_network')
    .eq('id', 1)
    .maybeSingle();

  if (configResult.error) {
    throw new Error(
      `Reporting baseline could not be loaded: ${configResult.error.message}`,
    );
  }

  if (
    configResult.data?.reporting_network === round.network &&
    configResult.data.reporting_start_at
  ) {
    return {
      periodStart: configResult.data.reporting_start_at,
      source: 'LAUNCH_BASELINE',
    };
  }

  return {
    periodStart: null,
    source: 'MISSING',
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireWalletSession({ request });
    const pool = await readVeInviteRewardPoolStatus();

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
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const requestedRoundId =
      request.nextUrl.searchParams.get('roundId');

    if (
      requestedRoundId &&
      !/^\d+$/.test(requestedRoundId)
    ) {
      return NextResponse.json(
        { error: 'roundId must be a positive integer.' },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const round = await loadCompletedRound({
      network: pool.network,
      appId: pool.appId,
      requestedRoundId,
    });

    if (!round) {
      return NextResponse.json(
        {
          error:
            requestedRoundId
              ? 'The requested completed reward round was not found.'
              : 'No completed reward round is available yet.',
        },
        {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const { periodStart, source } =
      await loadPeriodStart({ round });

    if (!periodStart) {
      return NextResponse.json(
        {
          error:
            'The first public reporting window has no launch baseline yet.',
          code: 'REPORTING_BASELINE_REQUIRED',
          rewardRoundId: String(round.id),
          periodEnd: round.created_at,
          writesPerformed: false,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const [
      eligibilityResult,
      payoutResult,
      queueResult,
      completedInPeriodResult,
      blockedResult,
      cumulativeEligibilityResult,
      cumulativeWeeklyResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('eligibility_check_events')
        .select('wallet_address, outcome, entry_class')
        .eq('network', round.network)
        .gte('created_at', periodStart)
        .lt('created_at', round.created_at),
      supabaseAdmin
        .from('reward_payouts')
        .select(
          'invite_code, recipient_wallet, amount_wei, status, paid_at',
        )
        .eq('round_id', String(round.id))
        .order('id', { ascending: true }),
      supabaseAdmin
        .from('reward_queue_entries')
        .select('invite_code, entry_class')
        .eq('network', round.network)
        .eq('assigned_round_id', String(round.id)),
      supabaseAdmin
        .from('reward_queue_entries')
        .select('invite_code', {
          count: 'exact',
          head: true,
        })
        .eq('network', round.network)
        .gte('eligible_at', periodStart)
        .lt('eligible_at', round.created_at),
      supabaseAdmin
        .from('invitations')
        .select('invite_code', {
          count: 'exact',
          head: true,
        })
        .eq('activation_network', round.network)
        .eq('sybil_status', 'BLOCKED')
        .gte('sybil_checked_at', periodStart)
        .lt('sybil_checked_at', round.created_at),
      supabaseAdmin
        .from('eligibility_check_events')
        .select('wallet_address, outcome, entry_class')
        .eq('network', round.network)
        .gte('created_at', periodStart),
      supabaseAdmin
        .from('operator_public_weekly_impact')
        .select(
          'successful_referrals_completed, paid_referral_rewards, rewarded_wallets, b3tr_distributed_wei',
        )
        .eq('network', round.network),
    ]);

    const queryErrors = [
      eligibilityResult.error,
      payoutResult.error,
      queueResult.error,
      completedInPeriodResult.error,
      blockedResult.error,
      cumulativeEligibilityResult.error,
      cumulativeWeeklyResult.error,
    ].filter(Boolean);

    if (queryErrors.length > 0) {
      throw new Error(
        `Round report data could not be loaded: ${queryErrors
          .map((error) => error?.message)
          .join('; ')}`,
      );
    }

    const eligibilityRows =
      (eligibilityResult.data ?? []) as EligibilityRow[];
    const payoutRows =
      (payoutResult.data ?? []) as PayoutRow[];
    const queueRows =
      (queueResult.data ?? []) as QueueRow[];

    const paidRows = payoutRows.filter(
      (row) => row.status === 'PAID' && row.paid_at,
    );

    if (
      payoutRows.length !== round.eligible_count ||
      paidRows.length !== round.eligible_count
    ) {
      return NextResponse.json(
        {
          error:
            'The completed reward round does not have a fully settled payout set.',
          code: 'ROUND_REPORT_INTEGRITY_CHECK_FAILED',
          rewardRoundId: String(round.id),
          expectedPayouts: round.eligible_count,
          storedPayouts: payoutRows.length,
          paidPayouts: paidRows.length,
          writesPerformed: false,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const distributedWei = paidRows
      .reduce(
        (sum, row) =>
          sum + BigInt(toUnsignedIntegerString(row.amount_wei)),
        0n,
      )
      .toString();

    if (
      distributedWei !==
      toUnsignedIntegerString(round.distributable_wei)
    ) {
      return NextResponse.json(
        {
          error:
            'The completed reward round payout total does not match its immutable distributable amount.',
          code: 'ROUND_REPORT_AMOUNT_MISMATCH',
          rewardRoundId: String(round.id),
          writesPerformed: false,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    if (queueRows.length !== paidRows.length) {
      return NextResponse.json(
        {
          error:
            'The reward queue assignment count does not match the settled payout count.',
          code: 'ROUND_REPORT_QUEUE_MISMATCH',
          rewardRoundId: String(round.id),
          writesPerformed: false,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const checkedWallets = countDistinct(
      eligibilityRows,
      () => true,
    );
    const newUsers = countDistinct(
      eligibilityRows,
      (row) =>
        row.outcome === 'ELIGIBLE' &&
        row.entry_class === 'NEW',
    );
    const returningUsers = countDistinct(
      eligibilityRows,
      (row) =>
        row.outcome === 'ELIGIBLE' &&
        row.entry_class === 'RETURNING',
    );
    const activeExistingUsers = countDistinct(
      eligibilityRows,
      (row) =>
        row.outcome === 'EXISTING_VEBETTER_USER' &&
        row.entry_class === 'ACTIVE_EXISTING',
    );

    const rewardedInviters = new Set(
      paidRows.map((row) =>
        row.recipient_wallet.toLowerCase(),
      ),
    ).size;
    const newUserReferralsPaid = queueRows.filter(
      (row) => row.entry_class === 'NEW',
    ).length;
    const returningUserReferralsPaid = queueRows.filter(
      (row) => row.entry_class === 'RETURNING',
    ).length;

    if (
      newUserReferralsPaid +
        returningUserReferralsPaid !==
      paidRows.length
    ) {
      return NextResponse.json(
        {
          error:
            'A settled referral payout has an unexpected entry classification.',
          code: 'ROUND_REPORT_ENTRY_CLASS_MISMATCH',
          rewardRoundId: String(round.id),
          writesPerformed: false,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const cumulativeEligibilityRows =
      (cumulativeEligibilityResult.data ?? []) as EligibilityRow[];
    const cumulativeNew = countDistinct(
      cumulativeEligibilityRows,
      (row) =>
        row.outcome === 'ELIGIBLE' &&
        row.entry_class === 'NEW',
    );
    const cumulativeReturning = countDistinct(
      cumulativeEligibilityRows,
      (row) =>
        row.outcome === 'ELIGIBLE' &&
        row.entry_class === 'RETURNING',
    );

    const cumulativeWeeklyRows =
      (cumulativeWeeklyResult.data ?? []) as WeeklyImpactRow[];
    const cumulativeCompleted = cumulativeWeeklyRows.reduce(
      (sum, row) =>
        sum + toSafeCount(row.successful_referrals_completed),
      0,
    );
    const cumulativePaid = cumulativeWeeklyRows.reduce(
      (sum, row) =>
        sum + toSafeCount(row.paid_referral_rewards),
      0,
    );
    const cumulativeRewardedWallets = cumulativeWeeklyRows.reduce(
      (sum, row) => sum + toSafeCount(row.rewarded_wallets),
      0,
    );
    const cumulativeB3trWei = cumulativeWeeklyRows
      .reduce(
        (sum, row) =>
          sum +
          BigInt(
            toUnsignedIntegerString(
              row.b3tr_distributed_wei,
            ),
          ),
        0n,
      )
      .toString();

    const avgWei = averageWei(
      distributedWei,
      paidRows.length,
    );

    const report: RoundReport = {
      rewardRoundId: String(round.id),
      network: round.network,
      periodStart,
      periodEnd: round.created_at,
      participation: {
        eligibilityChecks: eligibilityRows.length,
        checkedWallets,
        newUsers,
        returningUsers,
        eligibleUsers: newUsers + returningUsers,
        activeExistingUsers,
        completedOnboardings:
          completedInPeriodResult.count ?? 0,
        sybilBlocked: blockedResult.count ?? 0,
      },
      rewards: {
        successfulReferralsPaid: paidRows.length,
        rewardedInviters,
        newUserReferralsPaid,
        returningUserReferralsPaid,
        distributedWei,
        distributedB3tr: formatWeiAsB3tr(
          distributedWei,
          2,
        ),
        averageRewardWei: avgWei,
        averageRewardB3tr: formatWeiAsB3tr(
          avgWei,
          2,
        ),
      },
      cumulative: {
        newUsers: cumulativeNew,
        returningUsers: cumulativeReturning,
        eligibleUsers:
          cumulativeNew + cumulativeReturning,
        completedOnboardings: cumulativeCompleted,
        paidReferralRewards: cumulativePaid,
        rewardedWallets: cumulativeRewardedWallets,
        b3trDistributedWei: cumulativeB3trWei,
        b3trDistributed: formatWeiAsB3tr(
          cumulativeB3trWei,
          2,
        ),
      },
    };

    return NextResponse.json(
      {
        report,
        posts: buildRoundReportPosts(report),
        reportingWindowSource: source,
        observedPoolBalanceWei:
          toUnsignedIntegerString(
            round.observed_pool_balance_wei,
          ),
        reservedBeforeRoundWei:
          toUnsignedIntegerString(
            round.reserved_before_round_wei,
          ),
        plannedRemainderWei:
          toUnsignedIntegerString(
            round.remainder_wei,
          ),
        note:
          'Public copy reports actual settled B3TR distributed. It does not label the observed pool balance as a single-round allocation because balances can include carry-over or prior remainder.',
        writesPerformed: false,
        transfersPerformed: false,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    console.error('Failed to build VeInvite round report:', error);

    return NextResponse.json(
      {
        error: 'VeInvite round report could not be generated.',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
