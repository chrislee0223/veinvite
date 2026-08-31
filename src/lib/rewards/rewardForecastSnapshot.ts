import { readPredictiveRewardPlanning } from '@/lib/rewards/predictivePlanning';
import {
  calculateRewardForecastPolicy,
  type RewardForecastPipeline,
} from '@/lib/rewards/rewardForecastPolicy';
import { readVeInviteRewardPoolStatus } from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';

const INTEGER_PATTERN = /^\d+$/;
const ALLOCATION_HISTORY_LIMIT = 8;
const RECIPIENT_HISTORY_LIMIT = 8;

export type RewardForecastSnapshot = {
  generatedAt: string;
  basisAllocationRoundId: number;
  projectedFundingRoundId: number;
  earliestCompletionRoundId: number;
  allocationSampleCount: number;
  recipientHistoryRoundCount: number;
  projectedAllocationWei: string;
  projectedAllocationLowWei: string;
  projectedAllocationHighWei: string;
  observedPoolBalanceWei: string;
  reservedExistingWei: string;
  expectedRecipients: number;
  recipientLow: number;
  recipientHigh: number;
  estimatedRewardWei: string;
  estimatedRewardLowWei: string;
  estimatedRewardHighWei: string;
  modelVersion: string;
};

function readIntegerString(value: unknown, fieldName: string): string {
  const normalized = String(value ?? '');
  if (!INTEGER_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return BigInt(normalized).toString();
}

function readCount(value: unknown, fieldName: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer.`);
  }
  return normalized;
}

function readRoundId(value: unknown, fieldName: string): number {
  const normalized = readCount(value, fieldName);
  if (normalized < 1) throw new Error(`${fieldName} must be at least 1.`);
  return normalized;
}

function readTimestamp(value: unknown, fieldName: string): string {
  const normalized = String(value ?? '');
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${fieldName} must be a valid timestamp.`);
  }
  return normalized;
}

function mapSnapshotRow(row: Record<string, unknown>): RewardForecastSnapshot {
  return {
    generatedAt: readTimestamp(row.generated_at, 'generated_at'),
    basisAllocationRoundId: readRoundId(
      row.basis_allocation_round_id,
      'basis_allocation_round_id',
    ),
    projectedFundingRoundId: readRoundId(
      row.projected_funding_round_id,
      'projected_funding_round_id',
    ),
    earliestCompletionRoundId: readRoundId(
      row.earliest_completion_round_id,
      'earliest_completion_round_id',
    ),
    allocationSampleCount: readCount(
      row.allocation_sample_count,
      'allocation_sample_count',
    ),
    recipientHistoryRoundCount: readCount(
      row.recipient_history_round_count,
      'recipient_history_round_count',
    ),
    projectedAllocationWei: readIntegerString(
      row.projected_allocation_wei,
      'projected_allocation_wei',
    ),
    projectedAllocationLowWei: readIntegerString(
      row.projected_allocation_low_wei,
      'projected_allocation_low_wei',
    ),
    projectedAllocationHighWei: readIntegerString(
      row.projected_allocation_high_wei,
      'projected_allocation_high_wei',
    ),
    observedPoolBalanceWei: readIntegerString(
      row.observed_pool_balance_wei,
      'observed_pool_balance_wei',
    ),
    reservedExistingWei: readIntegerString(
      row.reserved_existing_wei,
      'reserved_existing_wei',
    ),
    expectedRecipients: readCount(row.expected_recipients, 'expected_recipients'),
    recipientLow: readCount(row.recipient_low, 'recipient_low'),
    recipientHigh: readCount(row.recipient_high, 'recipient_high'),
    estimatedRewardWei: readIntegerString(row.estimated_reward_wei, 'estimated_reward_wei'),
    estimatedRewardLowWei: readIntegerString(
      row.estimated_reward_low_wei,
      'estimated_reward_low_wei',
    ),
    estimatedRewardHighWei: readIntegerString(
      row.estimated_reward_high_wei,
      'estimated_reward_high_wei',
    ),
    modelVersion: String(row.model_version ?? ''),
  };
}

export async function readLatestRewardForecastSnapshot(input: {
  network: string;
  appId: string;
}): Promise<RewardForecastSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from('reward_forecast_snapshots')
    .select('*')
    .eq('network', input.network)
    .eq('app_id', input.appId)
    .order('generated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Latest reward forecast snapshot could not be loaded: ${error.message}`);
  }

  return data ? mapSnapshotRow(data as Record<string, unknown>) : null;
}

function pendingAgeWeights(createdAt: string, nowMs: number): {
  expectedBps: number;
  stressBps: number;
  bucket: 'fresh' | 'aging' | 'stale' | 'old';
} {
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) {
    return { expectedBps: 50, stressBps: 150, bucket: 'old' };
  }

  const ageHours = Math.max(0, (nowMs - createdMs) / 3_600_000);
  if (ageHours <= 24) return { expectedBps: 500, stressBps: 1_000, bucket: 'fresh' };
  if (ageHours <= 72) return { expectedBps: 300, stressBps: 700, bucket: 'aging' };
  if (ageHours <= 168) return { expectedBps: 150, stressBps: 400, bucket: 'stale' };
  return { expectedBps: 50, stressBps: 150, bucket: 'old' };
}

async function readForecastPipeline(input: {
  network: string;
  basePipeline: {
    queuedEligibleCount: number;
    voteReadyCount: number;
    vot3ReadyCount: number;
    appsTwoCount: number;
    appsOneCount: number;
    activatedZeroCount: number;
  };
}) {
  const { data: pendingRows, error } = await supabaseAdmin
    .from('invitations')
    .select('created_at')
    .eq('status', 'PENDING_ACCEPTANCE')
    .is('reward_eligible_at', null);

  if (error) {
    throw new Error(`Pending invitation ages could not be loaded: ${error.message}`);
  }

  const nowMs = Date.now();
  let pendingAcceptanceExpectedBps = 0;
  let pendingAcceptanceStressBps = 0;
  const ageBuckets = { fresh: 0, aging: 0, stale: 0, old: 0 };

  for (const row of pendingRows ?? []) {
    const weights = pendingAgeWeights(String(row.created_at ?? ''), nowMs);
    pendingAcceptanceExpectedBps += weights.expectedBps;
    pendingAcceptanceStressBps += weights.stressBps;
    ageBuckets[weights.bucket] += 1;
  }

  const pipeline: RewardForecastPipeline = {
    ...input.basePipeline,
    pendingAcceptanceExpectedBps,
    pendingAcceptanceStressBps,
  };

  return { pipeline, ageBuckets };
}

export async function refreshRewardForecastSnapshot(input: {
  network: string;
  appId: string;
}): Promise<RewardForecastSnapshot | null> {
  const pool = await readVeInviteRewardPoolStatus();
  if (pool.network !== input.network || pool.appId !== input.appId) {
    throw new Error('Reward forecast pool identity does not match the requested network and app.');
  }

  const planning = await readPredictiveRewardPlanning({
    network: input.network,
    appId: input.appId,
    observedPoolBalanceWei: pool.effectiveRewardPoolWei,
  });

  if (!planning.latestAllocation) return null;

  const { data: allocationRows, error: allocationError } = await supabaseAdmin
    .from('vebetter_round_allocations')
    .select('vebetter_round_id,rewards_allocation_amount_wei')
    .eq('network', input.network)
    .eq('app_id', input.appId)
    .gt('rewards_allocation_amount_wei', 0)
    .order('vebetter_round_id', { ascending: false })
    .limit(ALLOCATION_HISTORY_LIMIT);

  if (allocationError) {
    throw new Error(`Reward allocation history could not be loaded: ${allocationError.message}`);
  }

  const recentAllocationWeiNewestFirst = (allocationRows ?? []).map((row, index) =>
    readIntegerString(row.rewards_allocation_amount_wei, `allocationHistory[${index}]`),
  );
  if (recentAllocationWeiNewestFirst.length === 0) return null;

  const { data: rewardRoundRows, error: rewardRoundError } = await supabaseAdmin
    .from('reward_rounds')
    .select('eligible_count')
    .eq('network', input.network)
    .eq('app_id', input.appId)
    .in('status', ['COMPLETED', 'PARTIAL'])
    .gt('eligible_count', 0)
    .order('vebetter_round_id', { ascending: false, nullsFirst: false })
    .limit(RECIPIENT_HISTORY_LIMIT);

  if (rewardRoundError) {
    throw new Error(`Reward recipient history could not be loaded: ${rewardRoundError.message}`);
  }

  const completedRewardRoundRecipientCounts = (rewardRoundRows ?? []).map((row, index) =>
    readCount(row.eligible_count, `rewardRecipientHistory[${index}]`),
  );

  const { pipeline, ageBuckets } = await readForecastPipeline({
    network: input.network,
    basePipeline: {
      queuedEligibleCount: planning.pipeline.queuedEligibleCount,
      voteReadyCount: planning.pipeline.voteReadyCount,
      vot3ReadyCount: planning.pipeline.vot3ReadyCount,
      appsTwoCount: planning.pipeline.appsTwoCount,
      appsOneCount: planning.pipeline.appsOneCount,
      activatedZeroCount: planning.pipeline.activatedZeroCount,
    },
  });

  const forecast = calculateRewardForecastPolicy({
    recentAllocationWeiNewestFirst,
    observedPoolBalanceWei: pool.effectiveRewardPoolWei,
    reservedExistingWei: planning.reservedExistingWei,
    pipeline,
    completedRewardRoundRecipientCounts,
  });

  const basisAllocationRoundId = readRoundId(
    planning.latestAllocation.veBetterRoundId,
    'latestAllocation.veBetterRoundId',
  );
  const projectedFundingRoundId = basisAllocationRoundId + 1;
  const earliestCompletionRoundId = projectedFundingRoundId + 1;
  const generatedAt = new Date().toISOString();

  const inputSnapshot = {
    forecastOnly: true,
    payoutAuthority: false,
    basisAllocationRoundId,
    projectedFundingRoundId,
    earliestCompletionRoundId,
    pipeline,
    pendingAcceptanceAgeBuckets: ageBuckets,
    allocationSamplesNewestFirst: recentAllocationWeiNewestFirst,
    completedRewardRoundRecipientCounts,
    observedPoolBalanceWei: pool.effectiveRewardPoolWei,
    reservedExistingWei: planning.reservedExistingWei,
    pipelineExpectedRecipients: forecast.pipelineExpectedRecipients,
    pipelineStressRecipients: forecast.pipelineStressRecipients,
    pricingCapacityWei: forecast.pricingCapacityWei,
  };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('reward_forecast_snapshots')
    .insert({
      network: input.network,
      app_id: input.appId,
      generated_at: generatedAt,
      basis_allocation_round_id: basisAllocationRoundId,
      projected_funding_round_id: projectedFundingRoundId,
      earliest_completion_round_id: earliestCompletionRoundId,
      allocation_sample_count: forecast.allocationSampleCount,
      recipient_history_round_count: forecast.recipientHistoryRoundCount,
      projected_allocation_wei: forecast.projectedAllocationWei,
      projected_allocation_low_wei: forecast.projectedAllocationLowWei,
      projected_allocation_high_wei: forecast.projectedAllocationHighWei,
      observed_pool_balance_wei: pool.effectiveRewardPoolWei,
      reserved_existing_wei: planning.reservedExistingWei,
      expected_recipients: forecast.expectedRecipients,
      recipient_low: forecast.recipientLow,
      recipient_high: forecast.recipientHigh,
      estimated_reward_wei: forecast.estimatedRewardWei,
      estimated_reward_low_wei: forecast.estimatedRewardLowWei,
      estimated_reward_high_wei: forecast.estimatedRewardHighWei,
      model_version: forecast.modelVersion,
      input_snapshot: inputSnapshot,
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    throw new Error(
      `Reward forecast snapshot could not be stored: ${insertError?.message ?? 'missing inserted row'}`,
    );
  }

  return mapSnapshotRow(inserted as Record<string, unknown>);
}
