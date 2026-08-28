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
  vebetter_round_id: string | number | null;
  allocation_receipt_id: string | number | null;
  allocation_rewards_wei: string | null;
  opening_carryover_wei: string | null;
  observed_pool_balance_wei: string;
  reserved_before_round_wei: string;
  distributable_wei: string;
  eligible_count: number;
  per_reward_wei: string;
  remainder_wei: string;
  created_at: string;
  completed_at: string | null;
};

type AllocationRow = {
  id: string | number;
  network: string;
  app_id: string;
  vebetter_round_id: string | number;
  total_amount_wei: string;
  unallocated_amount_wei: string;
  team_allocation_amount_wei: string;
  rewards_allocation_amount_wei: string;
  claim_tx_id: string;
  claim_block_number: string | number;
  claim_block_timestamp: string;
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

type SybilReviewRow = {
  invite_code: string;
  resulting_status: string;
};

function distinctWalletCount(
  rows: EligibilityRow[],
  predicate: (row: EligibilityRow) => boolean,
): number {
  return new Set(
    rows
      .filter(predicate)
      .map((row) => row.wallet_address.toLowerCase()),
  ).size;
}

function toUnsignedIntegerString(value: unknown): string {
  const normalized = String(value ?? '0');

  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      'Report amount is not an unsigned integer string.',
    );
  }

  return BigInt(normalized).toString();
}

function sameStringSet(
  left: string[],
  right: string[],
): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  return [...leftSet].every((value) =>
    rightSet.has(value),
  );
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
      'id, network, app_id, status, vebetter_round_id, allocation_receipt_id, allocation_rewards_wei, opening_carryover_wei, observed_pool_balance_wei, reserved_before_round_wei, distributable_wei, eligible_count, per_reward_wei, remainder_wei, created_at, completed_at',
    )
    .eq('network', network)
    .eq('app_id', appId)
    .eq('status', 'COMPLETED');

  if (requestedRoundId) {
    query = query.eq('id', requestedRoundId);
  } else {
    query = query
      .order('id', { ascending: false })
      .limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(
      `Completed reward round could not be loaded: ${error.message}`,
    );
  }

  return (data as RewardRoundRow | null) ?? null;
}

async function loadAllocationReceipt(
  round: RewardRoundRow,
): Promise<AllocationRow | null> {
  if (
    round.allocation_receipt_id === null ||
    round.vebetter_round_id === null ||
    round.allocation_rewards_wei === null ||
    round.opening_carryover_wei === null
  ) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('vebetter_round_allocations')
    .select(
      'id, network, app_id, vebetter_round_id, total_amount_wei, unallocated_amount_wei, team_allocation_amount_wei, rewards_allocation_amount_wei, claim_tx_id, claim_block_number, claim_block_timestamp',
    )
    .eq('id', String(round.allocation_receipt_id))
    .maybeSingle();

  if (error) {
    throw new Error(
      `VeBetter allocation receipt could not be loaded: ${error.message}`,
    );
  }

  const receipt = (data as AllocationRow | null) ?? null;

  if (!receipt) {
    return null;
  }

  if (
    receipt.network !== round.network ||
    receipt.app_id !== round.app_id ||
    String(receipt.vebetter_round_id) !==
      String(round.vebetter_round_id) ||
    toUnsignedIntegerString(
      receipt.rewards_allocation_amount_wei,
    ) !==
      toUnsignedIntegerString(
        round.allocation_rewards_wei,
      )
  ) {
    throw new Error(
      'VeBetter allocation receipt does not match the completed VeInvite reward round.',
    );
  }

  return receipt;
}

async function loadReportingBaseline(
  network: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('operator_reporting_config')
    .select('reporting_start_at, reporting_network')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Reporting baseline could not be loaded: ${error.message}`,
    );
  }

  if (
    data?.reporting_network !== network ||
    !data.reporting_start_at
  ) {
    return null;
  }

  return data.reporting_start_at;
}

async function loadPeriodStart({
  round,
  baseline,
}: {
  round: RewardRoundRow;
  baseline: string;
}): Promise<{
  periodStart: string;
  source:
    | 'PREVIOUS_REWARD_ROUND'
    | 'LAUNCH_BASELINE';
}> {
  const { data, error } = await supabaseAdmin
    .from('reward_rounds')
    .select('id, created_at')
    .eq('network', round.network)
    .eq('app_id', round.app_id)
    .lt('created_at', round.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Previous reward round could not be loaded: ${error.message}`,
    );
  }

  if (
    data?.created_at &&
    new Date(data.created_at).getTime() >=
      new Date(baseline).getTime()
  ) {
    return {
      periodStart: data.created_at,
      source: 'PREVIOUS_REWARD_ROUND',
    };
  }

  return {
    periodStart: baseline,
    source: 'LAUNCH_BASELINE',
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
      !/^[1-9]\d*$/.test(requestedRoundId)
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
          error: requestedRoundId
            ? 'The requested completed reward round was not found.'
            : 'No completed reward round is available yet.',
        },
        {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    if (!round.completed_at) {
      return NextResponse.json(
        {
          error:
            'The completed reward round has no completion timestamp.',
          code: 'ROUND_COMPLETION_TIMESTAMP_MISSING',
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

    const allocationReceipt =
      await loadAllocationReceipt(round);

    if (!allocationReceipt) {
      return NextResponse.json(
        {
          error:
            'The completed reward round is missing immutable VeBetterDAO allocation evidence.',
          code: 'ROUND_ALLOCATION_EVIDENCE_MISSING',
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

    const baseline =
      await loadReportingBaseline(round.network);

    if (!baseline) {
      return NextResponse.json(
        {
          error:
            'Public reporting has no launch baseline yet.',
          code: 'REPORTING_BASELINE_REQUIRED',
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

    if (
      new Date(round.created_at).getTime() <
      new Date(baseline).getTime()
    ) {
      return NextResponse.json(
        {
          error:
            'The requested reward round predates the public reporting baseline.',
          code: 'ROUND_PREDATES_REPORTING_BASELINE',
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

    const { periodStart, source } =
      await loadPeriodStart({
        round,
        baseline,
      });

    const cumulativeRoundsResult = await supabaseAdmin
      .from('reward_rounds')
      .select('id')
      .eq('network', round.network)
      .eq('app_id', round.app_id)
      .eq('status', 'COMPLETED')
      .gte('completed_at', baseline)
      .lte('completed_at', round.completed_at);

    if (cumulativeRoundsResult.error) {
      throw new Error(
        `Cumulative reward rounds could not be loaded: ${cumulativeRoundsResult.error.message}`,
      );
    }

    const cumulativeRoundIds = (
      cumulativeRoundsResult.data ?? []
    ).map((row) => String(row.id));

    const [
      eligibilityResult,
      payoutResult,
      queueResult,
      completedInPeriodResult,
      sybilReviewResult,
      cumulativeEligibilityResult,
      cumulativeCompletedResult,
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
        .from('sybil_review_events')
        .select('invite_code, resulting_status')
        .eq('resulting_status', 'BLOCKED')
        .gte('created_at', periodStart)
        .lt('created_at', round.created_at),
      supabaseAdmin
        .from('eligibility_check_events')
        .select('wallet_address, outcome, entry_class')
        .eq('network', round.network)
        .gte('created_at', baseline)
        .lte('created_at', round.completed_at),
      supabaseAdmin
        .from('reward_queue_entries')
        .select('invite_code', {
          count: 'exact',
          head: true,
        })
        .eq('network', round.network)
        .gte('eligible_at', baseline)
        .lte('eligible_at', round.completed_at),
    ]);

    const queryErrors = [
      eligibilityResult.error,
      payoutResult.error,
      queueResult.error,
      completedInPeriodResult.error,
      sybilReviewResult.error,
      cumulativeEligibilityResult.error,
      cumulativeCompletedResult.error,
    ].filter(Boolean);

    if (queryErrors.length > 0) {
      throw new Error(
        `Round report data could not be loaded: ${queryErrors
          .map((error) => error?.message)
          .join('; ')}`,
      );
    }

    const sybilRows =
      (sybilReviewResult.data ?? []) as SybilReviewRow[];
    const sybilCodes = [
      ...new Set(
        sybilRows
          .filter(
            (row) =>
              row.resulting_status === 'BLOCKED',
          )
          .map((row) => row.invite_code),
      ),
    ];

    let networkSybilBlocked = 0;

    if (sybilCodes.length > 0) {
      const sybilInvitationResult = await supabaseAdmin
        .from('invitations')
        .select('invite_code')
        .eq('activation_network', round.network)
        .in('invite_code', sybilCodes);

      if (sybilInvitationResult.error) {
        throw new Error(
          `Sybil invitation network check failed: ${sybilInvitationResult.error.message}`,
        );
      }

      networkSybilBlocked = new Set(
        (sybilInvitationResult.data ?? []).map(
          (row) => row.invite_code,
        ),
      ).size;
    }

    let cumulativePayoutRows: PayoutRow[] = [];

    if (cumulativeRoundIds.length > 0) {
      const cumulativePayoutResult = await supabaseAdmin
        .from('reward_payouts')
        .select(
          'invite_code, recipient_wallet, amount_wei, status, paid_at',
        )
        .in('round_id', cumulativeRoundIds)
        .eq('status', 'PAID')
        .gte('paid_at', baseline)
        .lte('paid_at', round.completed_at);

      if (cumulativePayoutResult.error) {
        throw new Error(
          `Cumulative payouts could not be loaded: ${cumulativePayoutResult.error.message}`,
        );
      }

      cumulativePayoutRows =
        (cumulativePayoutResult.data ?? []) as PayoutRow[];
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

    const payoutCodes = paidRows.map((row) => row.invite_code);
    const queueCodes = queueRows.map((row) => row.invite_code);

    if (
      queueRows.length !== paidRows.length ||
      !sameStringSet(payoutCodes, queueCodes)
    ) {
      return NextResponse.json(
        {
          error:
            'The assigned reward queue does not match the settled payout set.',
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

    const distributedWei = paidRows
      .reduce(
        (sum, row) =>
          sum +
          BigInt(
            toUnsignedIntegerString(row.amount_wei),
          ),
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
            'The settled payout total does not match the immutable distributable amount.',
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

    const checkedWallets = distinctWalletCount(
      eligibilityRows,
      () => true,
    );
    const newUsers = distinctWalletCount(
      eligibilityRows,
      (row) =>
        row.outcome === 'ELIGIBLE' &&
        row.entry_class === 'NEW',
    );
    const returningUsers = distinctWalletCount(
      eligibilityRows,
      (row) =>
        row.outcome === 'ELIGIBLE' &&
        row.entry_class === 'RETURNING',
    );
    const eligibleUsers = distinctWalletCount(
      eligibilityRows,
      (row) =>
        row.outcome === 'ELIGIBLE' &&
        (row.entry_class === 'NEW' ||
          row.entry_class === 'RETURNING'),
    );
    const activeExistingUsers = distinctWalletCount(
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
    const cumulativeNew = distinctWalletCount(
      cumulativeEligibilityRows,
      (row) =>
        row.outcome === 'ELIGIBLE' &&
        row.entry_class === 'NEW',
    );
    const cumulativeReturning = distinctWalletCount(
      cumulativeEligibilityRows,
      (row) =>
        row.outcome === 'ELIGIBLE' &&
        row.entry_class === 'RETURNING',
    );
    const cumulativeEligible = distinctWalletCount(
      cumulativeEligibilityRows,
      (row) =>
        row.outcome === 'ELIGIBLE' &&
        (row.entry_class === 'NEW' ||
          row.entry_class === 'RETURNING'),
    );

    const cumulativeB3trWei = cumulativePayoutRows
      .reduce(
        (sum, row) =>
          sum +
          BigInt(
            toUnsignedIntegerString(row.amount_wei),
          ),
        0n,
      )
      .toString();
    const cumulativeRewardedInviters = new Set(
      cumulativePayoutRows.map((row) =>
        row.recipient_wallet.toLowerCase(),
      ),
    ).size;

    const averageRewardWei = averageWei(
      distributedWei,
      paidRows.length,
    );

    const totalAppAllocationWei =
      toUnsignedIntegerString(
        allocationReceipt.total_amount_wei,
      );
    const teamAllocationWei =
      toUnsignedIntegerString(
        allocationReceipt.team_allocation_amount_wei,
      );
    const rewardPoolAllocationWei =
      toUnsignedIntegerString(
        allocationReceipt.rewards_allocation_amount_wei,
      );
    const openingCarryoverWei =
      toUnsignedIntegerString(
        round.opening_carryover_wei,
      );
    const closingCarryoverWei =
      toUnsignedIntegerString(
        round.remainder_wei,
      );

    const report: RoundReport = {
      rewardRoundId: String(round.id),
      network: round.network,
      periodStart,
      periodEnd: round.created_at,
      funding: {
        veBetterRoundId:
          String(allocationReceipt.vebetter_round_id),
        totalAppAllocationWei,
        totalAppAllocationB3tr:
          formatWeiAsB3tr(totalAppAllocationWei, 2),
        teamAllocationWei,
        teamAllocationB3tr:
          formatWeiAsB3tr(teamAllocationWei, 2),
        rewardPoolAllocationWei,
        rewardPoolAllocationB3tr:
          formatWeiAsB3tr(rewardPoolAllocationWei, 2),
        openingCarryoverWei,
        openingCarryoverB3tr:
          formatWeiAsB3tr(openingCarryoverWei, 2),
        closingCarryoverWei,
        closingCarryoverB3tr:
          formatWeiAsB3tr(closingCarryoverWei, 2),
      },
      participation: {
        eligibilityChecks: eligibilityRows.length,
        checkedWallets,
        newUsers,
        returningUsers,
        eligibleUsers,
        activeExistingUsers,
        completedOnboardings:
          completedInPeriodResult.count ?? 0,
        sybilBlocked: networkSybilBlocked,
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
        averageRewardWei,
        averageRewardB3tr: formatWeiAsB3tr(
          averageRewardWei,
          2,
        ),
      },
      cumulative: {
        newUsers: cumulativeNew,
        returningUsers: cumulativeReturning,
        eligibleUsers: cumulativeEligible,
        completedOnboardings:
          cumulativeCompletedResult.count ?? 0,
        paidReferralRewards:
          cumulativePayoutRows.length,
        rewardedInviters:
          cumulativeRewardedInviters,
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
        launchBaseline: baseline,
        reportFinalizedAt: round.completed_at,
        allocationEvidence: {
          receiptId:
            String(allocationReceipt.id),
          claimTxId:
            allocationReceipt.claim_tx_id,
          claimBlockNumber:
            String(allocationReceipt.claim_block_number),
          claimBlockTimestamp:
            allocationReceipt.claim_block_timestamp,
          unallocatedAmountWei:
            toUnsignedIntegerString(
              allocationReceipt.unallocated_amount_wei,
            ),
        },
        observedPoolBalanceWei:
          toUnsignedIntegerString(
            round.observed_pool_balance_wei,
          ),
        reservedBeforeRoundWei:
          toUnsignedIntegerString(
            round.reserved_before_round_wei,
          ),
        note:
          'Public copy uses the immutable VeBetterDAO allocation receipt and actual settled referral payouts. Carry-over is shown separately so a prior balance is never mislabeled as the current-round allocation.',
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

    console.error(
      'Failed to build VeInvite round report:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite round report could not be generated.',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
