import {
  calculatePredictiveRewardPolicy,
  type PredictiveRewardPolicy,
  type RewardPipelineSnapshot,
} from '@/lib/rewards/predictivePolicy';
import { supabaseAdmin } from '@/lib/supabaseServer';

const INTEGER_PATTERN = /^\d+$/;

export type PredictiveAllocationSnapshot = {
  id: string;
  veBetterRoundId: string;
  rewardsAllocationWei: string;
  claimBlockTimestamp: string;
};

export type RewardBudgetEpochSnapshot = {
  id: string;
  veBetterRoundId: string;
  allocationRewardsWei: string;
  openingPoolBalanceWei: string;
  openingReservedWei: string;
  expectedCompletions: number;
  stressCompletions: number;
  rewardPerInviteWei: string;
  algorithmVersion: string;
  pipelineSnapshot: Record<string, unknown>;
  createdAt: string;
};

export type PredictiveRewardPlanningSnapshot = {
  reservedExistingWei: string;
  cohortReservedWei: string;
  fundingAdjustmentWei: string;
  designatedBudgetWei: string;
  rewardCohortRoundId: string | null;
  pipeline: RewardPipelineSnapshot;
  latestAllocation: PredictiveAllocationSnapshot | null;
  activeEpoch: RewardBudgetEpochSnapshot | null;
  forecast: PredictiveRewardPolicy | null;
};

export type ClaimedRewardCohort = {
  rewardCohortRoundId: string;
  allocationReceiptId: string;
};

function readRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} is malformed.`);
  }
  return value as Record<string, unknown>;
}

function readIntegerString(value: unknown, fieldName: string): string {
  const normalized = String(value ?? '');
  if (!INTEGER_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return BigInt(normalized).toString();
}

function readPositiveIntegerString(value: unknown, fieldName: string): string {
  const normalized = readIntegerString(value, fieldName);
  if (BigInt(normalized) < 1n) {
    throw new Error(`${fieldName} must be at least 1.`);
  }
  return normalized;
}

function readCount(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer.`);
  }
  return parsed;
}

function readPipeline(value: unknown): RewardPipelineSnapshot {
  const record = readRecord(value, 'pipeline');
  return {
    queuedEligibleCount: readCount(record.queuedEligibleCount, 'pipeline.queuedEligibleCount'),
    voteReadyCount: readCount(record.voteReadyCount, 'pipeline.voteReadyCount'),
    vot3ReadyCount: readCount(record.vot3ReadyCount, 'pipeline.vot3ReadyCount'),
    appsTwoCount: readCount(record.appsTwoCount, 'pipeline.appsTwoCount'),
    appsOneCount: readCount(record.appsOneCount, 'pipeline.appsOneCount'),
    activatedZeroCount: readCount(record.activatedZeroCount, 'pipeline.activatedZeroCount'),
    pendingAcceptanceCount: readCount(record.pendingAcceptanceCount, 'pipeline.pendingAcceptanceCount'),
  };
}

function readAllocation(value: unknown): PredictiveAllocationSnapshot | null {
  if (value === null || value === undefined) return null;
  const record = readRecord(value, 'latestAllocation');
  const claimBlockTimestamp = String(record.claimBlockTimestamp ?? '');
  if (!claimBlockTimestamp || Number.isNaN(Date.parse(claimBlockTimestamp))) {
    throw new Error('latestAllocation.claimBlockTimestamp is invalid.');
  }
  return {
    id: readPositiveIntegerString(record.id, 'latestAllocation.id'),
    veBetterRoundId: readPositiveIntegerString(record.veBetterRoundId, 'latestAllocation.veBetterRoundId'),
    rewardsAllocationWei: readIntegerString(record.rewardsAllocationWei, 'latestAllocation.rewardsAllocationWei'),
    claimBlockTimestamp,
  };
}

function readEpoch(value: unknown): RewardBudgetEpochSnapshot | null {
  if (value === null || value === undefined) return null;
  const record = readRecord(value, 'activeEpoch');
  const pipelineSnapshot = readRecord(record.pipelineSnapshot, 'activeEpoch.pipelineSnapshot');
  const createdAt = String(record.createdAt ?? '');
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('activeEpoch.createdAt is invalid.');
  }
  return {
    id: readPositiveIntegerString(record.id, 'activeEpoch.id'),
    veBetterRoundId: readPositiveIntegerString(record.veBetterRoundId, 'activeEpoch.veBetterRoundId'),
    allocationRewardsWei: readIntegerString(record.allocationRewardsWei, 'activeEpoch.allocationRewardsWei'),
    openingPoolBalanceWei: readIntegerString(record.openingPoolBalanceWei, 'activeEpoch.openingPoolBalanceWei'),
    openingReservedWei: readIntegerString(record.openingReservedWei, 'activeEpoch.openingReservedWei'),
    expectedCompletions: readCount(record.expectedCompletions, 'activeEpoch.expectedCompletions'),
    stressCompletions: readCount(record.stressCompletions, 'activeEpoch.stressCompletions'),
    rewardPerInviteWei: readIntegerString(record.rewardPerInviteWei, 'activeEpoch.rewardPerInviteWei'),
    algorithmVersion: String(record.algorithmVersion ?? ''),
    pipelineSnapshot,
    createdAt,
  };
}

export async function readPredictiveRewardPlanning(input: {
  network: string;
  appId: string;
  observedPoolBalanceWei: string;
  rewardCohortRoundId?: string | number | null;
  allocationReceiptId?: string | number | null;
  includePendingAcceptance?: boolean;
}): Promise<PredictiveRewardPlanningSnapshot> {
  const hasCohort = input.rewardCohortRoundId !== undefined && input.rewardCohortRoundId !== null;
  const hasReceipt = input.allocationReceiptId !== undefined && input.allocationReceiptId !== null;
  if (hasCohort !== hasReceipt) {
    throw new Error('Reward cohort round and allocation receipt must be provided together.');
  }

  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_cohort_planning_snapshot',
    {
      p_network: input.network,
      p_app_id: input.appId,
      p_reward_cohort_round_id: hasCohort
        ? readPositiveIntegerString(input.rewardCohortRoundId, 'rewardCohortRoundId')
        : null,
      p_allocation_receipt_id: hasReceipt
        ? readPositiveIntegerString(input.allocationReceiptId, 'allocationReceiptId')
        : null,
    },
  );

  if (error) {
    throw new Error(`Reward cohort planning snapshot could not be loaded: ${error.message}`);
  }

  const record = readRecord(data, 'reward cohort planning snapshot');
  const reservedExistingWei = readIntegerString(record.reservedExistingWei, 'reservedExistingWei');
  const fundingAdjustmentWei = readIntegerString(record.fundingAdjustmentWei, 'fundingAdjustmentWei');
  const designatedBudgetWei = readIntegerString(record.designatedBudgetWei, 'designatedBudgetWei');
  const rewardCohortRoundId = record.rewardCohortRoundId === null || record.rewardCohortRoundId === undefined
    ? null
    : readPositiveIntegerString(record.rewardCohortRoundId, 'rewardCohortRoundId');
  const rawPipeline = readPipeline(record.pipeline);
  const pipeline: RewardPipelineSnapshot = input.includePendingAcceptance === false
    ? {
        ...rawPipeline,
        pendingAcceptanceCount: 0,
      }
    : rawPipeline;
  const latestAllocation = readAllocation(record.latestAllocation);
  const activeEpoch = readEpoch(record.activeEpoch);

  let cohortReservedWei = readIntegerString(record.cohortReservedWei, 'cohortReservedWei');
  if (latestAllocation && rewardCohortRoundId) {
    const { data: committedData, error: committedError } = await supabaseAdmin.rpc(
      'read_reward_cohort_committed_wei',
      {
        p_network: input.network,
        p_app_id: input.appId,
        p_reward_cohort_round_id: rewardCohortRoundId,
        p_allocation_receipt_id: latestAllocation.id,
      },
    );

    if (committedError) {
      throw new Error(`Reward cohort committed funding could not be loaded: ${committedError.message}`);
    }

    // Lifetime committed funding includes paid reservations as well as unsettled
    // liabilities. Paid rewards never make the cohort budget reusable.
    cohortReservedWei = readIntegerString(
      committedData,
      'rewardCohortCommittedWei',
    );
  }

  const forecast = latestAllocation && rewardCohortRoundId
    ? calculatePredictiveRewardPolicy({
        latestAllocationWei: latestAllocation.rewardsAllocationWei,
        fundingAdjustmentWei,
        cohortReservedWei,
        observedPoolBalanceWei: input.observedPoolBalanceWei,
        reservedExistingWei,
        pipeline,
      })
    : null;

  return {
    reservedExistingWei,
    cohortReservedWei,
    fundingAdjustmentWei,
    designatedBudgetWei,
    rewardCohortRoundId,
    pipeline,
    latestAllocation,
    activeEpoch,
    forecast,
  };
}

export async function readNextClaimedRewardCohort(input: {
  network: string;
  appId: string;
}): Promise<ClaimedRewardCohort | null> {
  const { data, error } = await supabaseAdmin.rpc(
    'read_next_claimed_reward_cohort',
    {
      p_network: input.network,
      p_app_id: input.appId,
    },
  );

  if (error) {
    throw new Error(`Next claimed reward cohort could not be loaded: ${error.message}`);
  }
  if (data === null || data === undefined) return null;

  const record = readRecord(data, 'next claimed reward cohort');
  return {
    rewardCohortRoundId: readPositiveIntegerString(record.rewardCohortRoundId, 'rewardCohortRoundId'),
    allocationReceiptId: readPositiveIntegerString(record.allocationReceiptId, 'allocationReceiptId'),
  };
}
