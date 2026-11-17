import 'server-only';

import { readPredictiveRewardPlanning } from '@/lib/rewards/predictivePlanning';
import { readVeInviteRewardPoolStatus } from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { parseExactPoolWei } from '@/lib/rewards/exactPoolWei';

// This is ONLY a verified physical-pool observation. It is not a per-person
// reward forecast, payout quote, or payout authority.
export const REWARD_POOL_OBSERVATION_MODEL_VERSION = 'reward-pool-observation-v1';

export type RewardPoolObservation = {
  generatedAt: string;
  basisAllocationRoundId: number;
  projectedFundingRoundId: number;
  earliestCompletionRoundId: number;
  observedPoolBalanceWei: string;
  modelVersion: typeof REWARD_POOL_OBSERVATION_MODEL_VERSION;
};

function positiveRound(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error('Invalid ' + field + ' in pool observation');
  }
  return n;
}

function mapRow(row: Record<string, unknown>): RewardPoolObservation {
  const generatedAt = String(row.generated_at ?? '');
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error('Invalid physical pool observation timestamp');
  }
  const basisAllocationRoundId = positiveRound(
    row.basis_allocation_round_id, 'allocation round',
  );
  const projectedFundingRoundId = positiveRound(
    row.projected_funding_round_id, 'funding round',
  );
  return {
    generatedAt,
    basisAllocationRoundId,
    projectedFundingRoundId,
    earliestCompletionRoundId: projectedFundingRoundId + 1,
    observedPoolBalanceWei: parseExactPoolWei(row.observed_pool_balance_wei),
    modelVersion: REWARD_POOL_OBSERVATION_MODEL_VERSION,
  };
}

export async function readLatestRewardPoolObservation(input: {
  network: string;
  appId: string;
  signal?: AbortSignal;
}): Promise<RewardPoolObservation | null> {
  // An exact-text SQL reader is required: PostgREST NUMERIC -> JSON Number
  // would silently round large token Wei. Never parse that as JS number.
  let query = supabaseAdmin.rpc('read_latest_reward_pool_observation', {
    p_network: input.network,
    p_app_id: input.appId,
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error('Physical pool observation read failed: ' + error.message);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function refreshRewardPoolObservation(input: {
  network: string;
  appId: string;
}): Promise<RewardPoolObservation | null> {
  const pool = await readVeInviteRewardPoolStatus();
  if (pool.network !== input.network || pool.appId !== input.appId) {
    throw new Error('Physical reward pool identity mismatch');
  }

  // Keep funding-ledger freshness checks, but NEVER calculate/store a legacy
  // expected recipient count or legacy per-person reward amount.
  const planning = await readPredictiveRewardPlanning({
    network: input.network,
    appId: input.appId,
    observedPoolBalanceWei: pool.effectiveRewardPoolWei,
  });
  if (!planning.latestAllocation || !planning.rewardCohortRoundId) return null;

  const basisAllocationRoundId = positiveRound(
    planning.latestAllocation.veBetterRoundId, 'allocation round',
  );
  const projectedFundingRoundId = positiveRound(
    planning.rewardCohortRoundId, 'funding round',
  );
  const row = {
    network: input.network,
    app_id: input.appId,
    generated_at: new Date().toISOString(),
    observed_pool_balance_wei: parseExactPoolWei(pool.effectiveRewardPoolWei),
    basis_allocation_round_id: basisAllocationRoundId,
    projected_funding_round_id: projectedFundingRoundId,
    input_snapshot: {
      rewardCohortRoundId: planning.rewardCohortRoundId,
      officialAllocationWei: planning.latestAllocation.rewardsAllocationWei,
      fundingAdjustmentWei: planning.fundingAdjustmentWei,
      reserveNetFlowWei: planning.reserveNetFlowWei,
      designatedBudgetWei: planning.designatedBudgetWei,
      cohortReservedWei: planning.cohortReservedWei,
      reservedExistingWei: planning.reservedExistingWei,
    },
  };
  const { error } = await supabaseAdmin.from('reward_pool_observations').insert(row);
  if (error) throw new Error('Physical pool observation save failed: ' + error.message);
  return mapRow(row as Record<string, unknown>);
}
