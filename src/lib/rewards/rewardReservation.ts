import 'server-only';

import { ThorClient } from '@vechain/sdk-network';

import { readVeInviteRewardPoolStatus, VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import { readPredictiveRewardPlanning } from '@/lib/rewards/predictivePlanning';
import { readRewardRuntimeSafety } from '@/lib/rewards/runtimeSafety';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

type ReservationCandidate = {
  invite_code: string;
  completion_block: string | number;
  completion_tx_index: number;
  completion_clause_index: number;
  reward_cohort_round_id: string | number;
  reward_funding_allocation_receipt_id: string | number;
};

type LateRewardQuote = {
  protectionId: string;
  amountWei: string;
  sourceRewardCohortRoundId: string;
  sourceAllocationReceiptId: string;
  baselineEffectiveBudgetWei: string;
  baselineCommittedWei: string;
  promotionReserveWei: string;
  lateWeightedLiabilityWei: string;
  sourceRevision: string;
  policyVersion: string;
};

type ReservationRpcResult = {
  reserved?: boolean;
  reason?: string;
  inviteCode?: string;
  amountWei?: string;
  reservedAt?: string;
};

export type RewardReservationSweepResult = {
  attempted: number;
  reserved: number;
  awaitingFinality: number;
  skipped: number;
};

export type RewardReservationLiveness = {
  missingCount: number;
  oldestRewardEligibleAt: string | null;
  inviteCodes: string[];
};

const MAX_RESERVATIONS_PER_SWEEP = 25;
const MAX_REPRICE_ATTEMPTS = 4;

function emptySweepResult(): RewardReservationSweepResult {
  return {
    attempted: 0,
    reserved: 0,
    awaitingFinality: 0,
    skipped: 0,
  };
}

async function rewardReservationRuntimeOpen(network: string): Promise<boolean> {
  const runtime = await readRewardRuntimeSafety();

  if (runtime.emergencyRewardsPaused) {
    return false;
  }

  if (
    network === 'mainnet' &&
    !runtime.mainnetFundedRewardsEnabled
  ) {
    return false;
  }

  return true;
}

function safeBlock(value: string | number, fieldName: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return parsed;
}

function positiveId(value: string | number, fieldName: string): string {
  const normalized = String(value);
  if (!/^\d+$/.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return BigInt(normalized).toString();
}

function readRpcResult(value: unknown): ReservationRpcResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Reward reservation returned malformed data.');
  }
  return value as ReservationRpcResult;
}

function nonNegativeWeiString(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '');
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return BigInt(normalized).toString();
}

async function readLateRewardQuote(
  network: string,
  inviteCode: string,
): Promise<LateRewardQuote | null> {
  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_boost_reserve_late_quote',
    {
      p_network: network,
      p_invite_code: inviteCode,
    },
  );

  if (error) {
    throw new Error(
      `Late reward protection quote could not be loaded: ${error.message}`,
    );
  }

  if (data === null || data === undefined) {
    return null;
  }

  if (
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new Error(
      'Late reward protection quote is malformed.',
    );
  }

  const row = data as Record<string, unknown>;
  const sourceRevision = String(
    row.sourceRevision ?? '',
  ).trim();
  const policyVersion = String(
    row.policyVersion ?? '',
  ).trim();

  if (!sourceRevision || !policyVersion) {
    throw new Error(
      'Late reward protection metadata is malformed.',
    );
  }

  return {
    protectionId: positiveId(
      String(row.protectionId ?? ''),
      'late reward protection id',
    ),
    amountWei: nonNegativeWeiString(
      row.amountWei,
      'late reward amount',
    ),
    sourceRewardCohortRoundId: positiveId(
      String(row.sourceRewardCohortRoundId ?? ''),
      'late reward cohort round id',
    ),
    sourceAllocationReceiptId: positiveId(
      String(row.sourceAllocationReceiptId ?? ''),
      'late reward allocation receipt id',
    ),
    baselineEffectiveBudgetWei: nonNegativeWeiString(
      row.baselineEffectiveBudgetWei,
      'late reward baseline budget',
    ),
    baselineCommittedWei: nonNegativeWeiString(
      row.baselineCommittedWei,
      'late reward baseline commitment',
    ),
    promotionReserveWei: nonNegativeWeiString(
      row.promotionReserveWei,
      'late reward promotion reserve',
    ),
    lateWeightedLiabilityWei: nonNegativeWeiString(
      row.lateWeightedLiabilityWei,
      'late reward weighted liability',
    ),
    sourceRevision,
    policyVersion,
  };
}

function skipCandidate(
  candidate: ReservationCandidate,
  reason: string,
  details: Record<string, unknown> = {},
): 'skipped' {
  console.warn(
    'Reward reservation candidate skipped:',
    {
      inviteCode: candidate.invite_code,
      reason,
      ...details,
    },
  );
  return 'skipped';
}

async function readFinalizedBlockNumber(): Promise<number> {
  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const finalized = await thor.blocks.getBlockCompressed('finalized');

  if (!finalized) {
    throw new Error('VeChain finalized block is unavailable.');
  }

  const number = Number(finalized.number);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('VeChain finalized block number is invalid.');
  }
  return number;
}

async function loadCandidates(network: string): Promise<ReservationCandidate[]> {
  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_reservation_candidates_v2',
    {
      p_network: network,
      p_limit: MAX_RESERVATIONS_PER_SWEEP,
    },
  );

  if (error) {
    throw new Error(`Reward reservation candidates could not be loaded: ${error.message}`);
  }

  return Array.isArray(data) ? (data as ReservationCandidate[]) : [];
}

export async function readStaleEligibleRewardReservationLiveness(
  staleMinutes = 15,
): Promise<RewardReservationLiveness> {
  if (
    !Number.isSafeInteger(staleMinutes) ||
    staleMinutes < 5 ||
    staleMinutes > 1440
  ) {
    throw new Error(
      'Reward reservation liveness threshold must be 5-1440 minutes.',
    );
  }

  const runtime =
    await readRewardRuntimeSafety();

  if (runtime.emergencyRewardsPaused) {
    return {
      missingCount: 0,
      oldestRewardEligibleAt: null,
      inviteCodes: [],
    };
  }

  const { network } =
    getVeBetterNetworkConfig();
  const { data, error } =
    await supabaseAdmin.rpc(
      'read_stale_reward_reservation_liveness',
      {
        p_network: network,
        p_stale_minutes: staleMinutes,
      },
    );

  if (error) {
    throw new Error(
      `Reward reservation liveness could not be read: ${error.message}`,
    );
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  if (
    !row ||
    typeof row !== 'object'
  ) {
    throw new Error(
      'Reward reservation liveness returned malformed data.',
    );
  }

  const record =
    row as Record<string, unknown>;
  const missingCount =
    Number(record.missing_count);

  if (
    !Number.isSafeInteger(missingCount) ||
    missingCount < 0
  ) {
    throw new Error(
      'Reward reservation liveness returned an invalid count.',
    );
  }

  const oldest =
    record.oldest_reward_eligible_at;
  const inviteCodes =
    Array.isArray(record.invite_codes)
      ? record.invite_codes.filter(
          (value): value is string =>
            typeof value === 'string',
        )
      : [];

  return {
    missingCount,
    oldestRewardEligibleAt:
      typeof oldest === 'string' &&
      !Number.isNaN(Date.parse(oldest))
        ? oldest
        : null,
    inviteCodes,
  };
}

async function reserveCandidate({
  candidate,
  network,
  finalizedBlock,
}: {
  candidate: ReservationCandidate;
  network: string;
  finalizedBlock: number;
}): Promise<'reserved' | 'awaiting_finality' | 'skipped'> {
  const completionBlock = safeBlock(
    candidate.completion_block,
    'reservation completion block',
  );
  const rewardCohortRoundId = positiveId(
    candidate.reward_cohort_round_id,
    'reward cohort round id',
  );
  const allocationReceiptId = positiveId(
    candidate.reward_funding_allocation_receipt_id,
    'reward funding allocation receipt id',
  );

  if (completionBlock > finalizedBlock) {
    return 'awaiting_finality';
  }

  for (let attempt = 0; attempt < MAX_REPRICE_ATTEMPTS; attempt += 1) {
    // Emergency pause and the mainnet funded-reward gate apply to creation of
    // new immutable reward liabilities as well as token settlement. Re-read
    // the runtime gate for every pricing attempt so a pause activated during a
    // sweep stops the next reservation instead of waiting for the sweep to end.
    if (!(await rewardReservationRuntimeOpen(network))) {
      return skipCandidate(
        candidate,
        'RUNTIME_CLOSED',
      );
    }

    // Financial authority is cohort-scoped. The public estimate is not trusted
    // here; the live pool and the exact funding receipt bound at onboarding are
    // re-read immediately before the immutable completion-time reservation.
    const pool = await readVeInviteRewardPoolStatus();
    if (pool.network !== network || pool.appId !== VEINVITE_APP_ID) {
      throw new Error('Reward reservation pool identity mismatch.');
    }

    if (pool.distributionPaused) {
      return skipCandidate(
        candidate,
        'POOL_DISTRIBUTION_PAUSED',
      );
    }

    const planning = await readPredictiveRewardPlanning({
      network,
      appId: VEINVITE_APP_ID,
      observedPoolBalanceWei: pool.effectiveRewardPoolWei,
      rewardCohortRoundId,
      allocationReceiptId,
      // A pending invite has no verified entry round yet. Once a specific
      // completed referral is being priced, unbound pending invites from a
      // newer round must never dilute this already-bound cohort.
      includePendingAcceptance: false,
    });

    if (!planning.latestAllocation || !planning.forecast || !planning.rewardCohortRoundId) {
      return skipCandidate(
        candidate,
        'PLANNING_UNAVAILABLE',
      );
    }

    if (
      planning.latestAllocation.id !== allocationReceiptId ||
      planning.rewardCohortRoundId !== rewardCohortRoundId
    ) {
      throw new Error('Reward reservation cohort planning mismatch.');
    }

    const lateQuote = await readLateRewardQuote(
      network,
      candidate.invite_code,
    );

    if (
      lateQuote &&
      (
        lateQuote.sourceRewardCohortRoundId !==
          rewardCohortRoundId ||
        lateQuote.sourceAllocationReceiptId !==
          allocationReceiptId
      )
    ) {
      throw new Error(
        'Late reward protection cohort mismatch.',
      );
    }

    const amountWei =
      lateQuote?.amountWei ??
      planning.forecast.rewardPerInviteWei;
    if (BigInt(amountWei) <= 0n) {
      return skipCandidate(
        candidate,
        'NON_POSITIVE_REWARD',
      );
    }

    const basis = {
      quoteKind: lateQuote
        ? 'late_completion_protected_v1'
        : 'completion_fixed_reservation_v2_cohort',
      rewardCohortRoundId,
      fundingAllocationReceiptId: allocationReceiptId,
      fundingAllocationRoundId: planning.latestAllocation.veBetterRoundId,
      officialAllocationWei: planning.latestAllocation.rewardsAllocationWei,
      fundingAdjustmentWei: planning.fundingAdjustmentWei,
      reserveNetFlowWei: planning.reserveNetFlowWei,
      designatedBudgetWei: planning.designatedBudgetWei,
      cohortReservedWei: planning.cohortReservedWei,
      observedPoolBalanceWei: pool.effectiveRewardPoolWei,
      reservedExistingWei: planning.reservedExistingWei,
      availablePoolWei: planning.forecast.availablePoolWei,
      pricingBasisWei: planning.forecast.pricingBasisWei,
      expectedCompletions: planning.forecast.expectedCompletions,
      stressCompletions: planning.forecast.stressCompletions,
      pipeline: planning.forecast.pipeline,
      lateCompletionProtection: lateQuote
        ? {
            protectionId: lateQuote.protectionId,
            protectedAmountWei: lateQuote.amountWei,
            baselineEffectiveBudgetWei:
              lateQuote.baselineEffectiveBudgetWei,
            baselineCommittedWei:
              lateQuote.baselineCommittedWei,
            promotionReserveWei:
              lateQuote.promotionReserveWei,
            lateWeightedLiabilityWei:
              lateQuote.lateWeightedLiabilityWei,
            sourceRevision:
              lateQuote.sourceRevision,
            policyVersion:
              lateQuote.policyVersion,
          }
        : null,
      completionPosition: {
        block: completionBlock,
        txIndex: candidate.completion_tx_index,
        clauseIndex: candidate.completion_clause_index,
      },
    };

    const { data, error } = await supabaseAdmin.rpc(
      'commit_reward_reservation_with_late_reserve',
      {
        p_invite_code: candidate.invite_code,
        p_network: network,
        p_observed_pool_balance_wei: pool.effectiveRewardPoolWei,
        p_expected_reserved_before_wei: planning.reservedExistingWei,
        p_amount_wei: amountWei,
        p_algorithm_version: lateQuote
          ? 'reward-boost-late-protection-v1'
          : planning.forecast.algorithmVersion,
        p_quote_snapshot_id: null,
        p_finalized_block: finalizedBlock,
        p_basis: basis,
      },
    );

    if (error) {
      throw new Error(`Reward reservation failed: ${error.message}`);
    }

    const result = readRpcResult(data);
    if (result.reserved === true) {
      return 'reserved';
    }
    if (result.reason === 'RECALCULATE') {
      continue;
    }
    if (result.reason === 'AWAITING_FINALITY') {
      return 'awaiting_finality';
    }
    return skipCandidate(
      candidate,
      'RPC_NOT_RESERVED',
      {
        rpcReason:
          result.reason ?? 'UNKNOWN',
      },
    );
  }

  return skipCandidate(
    candidate,
    'REPRICE_EXHAUSTED',
  );
}

export async function reserveEligibleReferralRewards(): Promise<RewardReservationSweepResult> {
  const { network } = getVeBetterNetworkConfig();

  // Fast fail-closed check before touching chain state or loading candidates.
  // reserveCandidate() repeats this check immediately before each quote so a
  // pause that flips during a sweep also takes effect without delay.
  if (!(await rewardReservationRuntimeOpen(network))) {
    return emptySweepResult();
  }

  const finalizedBlock = await readFinalizedBlockNumber();
  const candidates = await loadCandidates(network);

  const result: RewardReservationSweepResult = {
    attempted: candidates.length,
    reserved: 0,
    awaitingFinality: 0,
    skipped: 0,
  };

  // Actual chain completion order remains the fairness ordering. Sequential
  // processing makes every quote see earlier reservations from the same sweep.
  for (const candidate of candidates) {
    const outcome = await reserveCandidate({ candidate, network, finalizedBlock });
    if (outcome === 'reserved') result.reserved += 1;
    else if (outcome === 'awaiting_finality') result.awaitingFinality += 1;
    else result.skipped += 1;
  }

  return result;
}
