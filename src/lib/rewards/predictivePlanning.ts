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
  pipeline: RewardPipelineSnapshot;
  latestAllocation: PredictiveAllocationSnapshot | null;
  activeEpoch: RewardBudgetEpochSnapshot | null;
  forecast: PredictiveRewardPolicy | null;
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
    queuedEligibleCount: readCount(
      record.queuedEligibleCount,
      'pipeline.queuedEligibleCount',
    ),
    voteReadyCount: readCount(
      record.voteReadyCount,
      'pipeline.voteReadyCount',
    ),
    vot3ReadyCount: readCount(
      record.vot3ReadyCount,
      'pipeline.vot3ReadyCount',
    ),
    appsTwoCount: readCount(
      record.appsTwoCount,
      'pipeline.appsTwoCount',
    ),
    appsOneCount: readCount(
      record.appsOneCount,
      'pipeline.appsOneCount',
    ),
    activatedZeroCount: readCount(
      record.activatedZeroCount,
      'pipeline.activatedZeroCount',
    ),
    pendingAcceptanceCount: readCount(
      record.pendingAcceptanceCount,
      'pipeline.pendingAcceptanceCount',
    ),
  };
}

function readAllocation(value: unknown): PredictiveAllocationSnapshot | null {
  if (value === null || value === undefined) {
    return null;
  }

  const record = readRecord(value, 'latestAllocation');
  const claimBlockTimestamp = String(record.claimBlockTimestamp ?? '');

  if (!claimBlockTimestamp || Number.isNaN(Date.parse(claimBlockTimestamp))) {
    throw new Error('latestAllocation.claimBlockTimestamp is invalid.');
  }

  return {
    id: readIntegerString(record.id, 'latestAllocation.id'),
    veBetterRoundId: readIntegerString(
      record.veBetterRoundId,
      'latestAllocation.veBetterRoundId',
    ),
    rewardsAllocationWei: readIntegerString(
      record.rewardsAllocationWei,
      'latestAllocation.rewardsAllocationWei',
    ),
    claimBlockTimestamp,
  };
}

function readEpoch(value: unknown): RewardBudgetEpochSnapshot | null {
  if (value === null || value === undefined) {
    return null;
  }

  const record = readRecord(value, 'activeEpoch');
  const pipelineSnapshot = readRecord(
    record.pipelineSnapshot,
    'activeEpoch.pipelineSnapshot',
  );
  const createdAt = String(record.createdAt ?? '');

  if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('activeEpoch.createdAt is invalid.');
  }

  return {
    id: readIntegerString(record.id, 'activeEpoch.id'),
    veBetterRoundId: readIntegerString(
      record.veBetterRoundId,
      'activeEpoch.veBetterRoundId',
    ),
    allocationRewardsWei: readIntegerString(
      record.allocationRewardsWei,
      'activeEpoch.allocationRewardsWei',
    ),
    openingPoolBalanceWei: readIntegerString(
      record.openingPoolBalanceWei,
      'activeEpoch.openingPoolBalanceWei',
    ),
    openingReservedWei: readIntegerString(
      record.openingReservedWei,
      'activeEpoch.openingReservedWei',
    ),
    expectedCompletions: readCount(
      record.expectedCompletions,
      'activeEpoch.expectedCompletions',
    ),
    stressCompletions: readCount(
      record.stressCompletions,
      'activeEpoch.stressCompletions',
    ),
    rewardPerInviteWei: readIntegerString(
      record.rewardPerInviteWei,
      'activeEpoch.rewardPerInviteWei',
    ),
    algorithmVersion: String(record.algorithmVersion ?? ''),
    pipelineSnapshot,
    createdAt,
  };
}

export async function readPredictiveRewardPlanning(input: {
  network: string;
  appId: string;
  observedPoolBalanceWei: string;
}): Promise<PredictiveRewardPlanningSnapshot> {
  const { data, error } = await supabaseAdmin.rpc(
    'read_predictive_reward_planning_snapshot',
    {
      p_network: input.network,
      p_app_id: input.appId,
    },
  );

  if (error) {
    throw new Error(
      `Predictive reward planning snapshot could not be loaded: ${error.message}`,
    );
  }

  const record = readRecord(data, 'predictive reward planning snapshot');
  const reservedExistingWei = readIntegerString(
    record.reservedExistingWei,
    'reservedExistingWei',
  );
  const pipeline = readPipeline(record.pipeline);
  const latestAllocation = readAllocation(record.latestAllocation);
  const activeEpoch = readEpoch(record.activeEpoch);

  const forecast = latestAllocation
    ? calculatePredictiveRewardPolicy({
        latestAllocationWei:
          latestAllocation.rewardsAllocationWei,
        observedPoolBalanceWei:
          input.observedPoolBalanceWei,
        reservedExistingWei,
        pipeline,
      })
    : null;

  return {
    reservedExistingWei,
    pipeline,
    latestAllocation,
    activeEpoch,
    forecast,
  };
}
