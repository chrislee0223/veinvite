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

function readRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} is malformed.`);
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} is malformed.`);
  }
  return value;
}

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
  const { data, error } = await supabaseAdmin.rpc(
    'read_latest_reward_forecast_snapshot',
    {
      p_network: input.network,
      p_app_id: input.appId,
    },
  );

  if (error) {
    throw new Error(`Latest reward forecast snapshot could not be loaded: ${error.message}`);
  }

  if (data === null || data === undefined) return null;
  return mapSnapshotRow(readRecord(data, 'latest reward forecast snapshot'));
}

async function readForecastHistory(input: {
  network: string;
  appId: string;
}): Promise<{
  recentAllocationWeiNewestFirst: string[];
  completedRewardRoundRecipientCounts: number[];
}> {
  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_forecast_history',
    {
      p_network: input.network,
      p_app_id: input.appId,
      p_allocation_limit: ALLOCATION_HISTORY_LIMIT,
      p_recipient_limit: RECIPIENT_HISTORY_LIMIT,
    },
  );

  if (error) {
    throw new Error(`Reward forecast history could not be loaded: ${error.message}`);
  }

  const record = readRecord(data, 'reward forecast history');
  const allocationValues = readArray(
    record.allocationWeiNewestFirst,
    'allocationWeiNewestFirst',
  );
  const recipientValues = readArray(
    record.completedRecipientCountsNewestFirst,
    'completedRecipientCountsNewestFirst',
  );

  return {
    recentAllocationWeiNewestFirst: allocationValues.map((value, index) =>
      readIntegerString(value, `allocationHistory[${index}]`),
    ),
    completedRewardRoundRecipientCounts: recipientValues.map((value, index) =>
      readCount(value, `rewardRecipientHistory[${index}]`),
    ),
  };
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

  const {
    recentAllocationWeiNewestFirst,
    completedRewardRoundRecipientCounts,
  } = await readForecastHistory(input);
  if (recentAllocationWeiNewestFirst.length === 0) return null;

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

  const { error: insertError } = await supabaseAdmin
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
    });

  if (insertError) {
    throw new Error(`Reward forecast snapshot could not be stored: ${insertError.message}`);
  }

  return {
    generatedAt,
    basisAllocationRoundId,
    projectedFundingRoundId,
    earliestCompletionRoundId,
    allocationSampleCount: forecast.allocationSampleCount,
    recipientHistoryRoundCount: forecast.recipientHistoryRoundCount,
    projectedAllocationWei: forecast.projectedAllocationWei,
    projectedAllocationLowWei: forecast.projectedAllocationLowWei,
    projectedAllocationHighWei: forecast.projectedAllocationHighWei,
    observedPoolBalanceWei: pool.effectiveRewardPoolWei,
    reservedExistingWei: planning.reservedExistingWei,
    expectedRecipients: forecast.expectedRecipients,
    recipientLow: forecast.recipientLow,
    recipientHigh: forecast.recipientHigh,
    estimatedRewardWei: forecast.estimatedRewardWei,
    estimatedRewardLowWei: forecast.estimatedRewardLowWei,
    estimatedRewardHighWei: forecast.estimatedRewardHighWei,
    modelVersion: forecast.modelVersion,
  };
}
