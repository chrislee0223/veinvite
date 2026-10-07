import 'server-only';

import {
  readVeInviteRewardPoolStatus,
  type VeInviteRewardPoolStatus,
  VEINVITE_APP_ID,
} from '@/lib/rewards/onchainPool';
import {
  refreshRewardForecastSnapshot,
  type RewardForecastSnapshot,
} from '@/lib/rewards/rewardForecastSnapshot';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const REWARD_BOOST_RESERVE_POLICY_VERSION =
  'reward-boost-reserve-v1';

type SourceRow = {
  reward_cohort_round_id: string | number;
  allocation_receipt_id: string | number;
};

type MutationPayload = {
  changed?: boolean;
  [key: string]: unknown;
};

export type RewardBoostReserveExecutionResult = {
  enabled: boolean;
  network: string;
  appId: string;
  sourceCandidates: number;
  sourceSweepsChanged: number;
  sourceResults: MutationPayload[];
  destinationResult: MutationPayload | null;
  forecast: RewardForecastSnapshot | null;
};

function positiveId(
  value: string | number,
  fieldName: string,
): string {
  const normalized = String(value);
  if (!/^\d+$/.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return BigInt(normalized).toString();
}

function mutationPayload(
  value: unknown,
  fieldName: string,
): MutationPayload {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(`${fieldName} returned malformed data.`);
  }
  return value as MutationPayload;
}

async function reserveEnabled(): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('reward_runtime_config')
    .select('reward_boost_reserve_enabled')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Reward boost reserve runtime configuration could not be loaded: ${error.message}`,
    );
  }
  if (!data) {
    throw new Error(
      'Reward boost reserve runtime configuration is missing.',
    );
  }

  const enabled =
    (data as { reward_boost_reserve_enabled?: unknown })
      .reward_boost_reserve_enabled;

  if (typeof enabled !== 'boolean') {
    throw new Error(
      'Reward boost reserve runtime flag is malformed.',
    );
  }

  return enabled;
}

export async function runRewardBoostReserveRebalance(
  providedPool?: VeInviteRewardPoolStatus,
): Promise<RewardBoostReserveExecutionResult> {
  const pool =
    providedPool ?? await readVeInviteRewardPoolStatus();

  if (pool.appId !== VEINVITE_APP_ID) {
    throw new Error(
      'Reward boost reserve pool identity mismatch.',
    );
  }

  if (!(await reserveEnabled())) {
    return {
      enabled: false,
      network: pool.network,
      appId: pool.appId,
      sourceCandidates: 0,
      sourceSweepsChanged: 0,
      sourceResults: [],
      destinationResult: null,
      forecast: null,
    };
  }

  if (pool.distributionPaused) {
    throw new Error(
      'Reward boost reserve cannot run while reward distribution is paused.',
    );
  }

  const { data: sourceData, error: sourceError } =
    await supabaseAdmin.rpc(
      'read_reward_boost_reserve_unprotected_sources',
      {
        p_network: pool.network,
        p_app_id: pool.appId,
      },
    );

  if (sourceError) {
    throw new Error(
      `Reward boost reserve sources could not be loaded: ${sourceError.message}`,
    );
  }

  const sources =
    Array.isArray(sourceData)
      ? (sourceData as SourceRow[])
      : [];

  const sourceResults: MutationPayload[] = [];
  let sourceSweepsChanged = 0;

  for (const source of sources) {
    const rewardCohortRoundId = positiveId(
      source.reward_cohort_round_id,
      'reward boost source cohort round',
    );
    const allocationReceiptId = positiveId(
      source.allocation_receipt_id,
      'reward boost source allocation receipt',
    );

    const { data, error } = await supabaseAdmin.rpc(
      'seal_and_sweep_reward_boost_reserve_source',
      {
        p_network: pool.network,
        p_app_id: pool.appId,
        p_source_reward_cohort_round_id:
          rewardCohortRoundId,
        p_source_allocation_receipt_id:
          allocationReceiptId,
        p_policy_version:
          REWARD_BOOST_RESERVE_POLICY_VERSION,
      },
    );

    if (error) {
      throw new Error(
        `Reward boost source ${rewardCohortRoundId}/${allocationReceiptId} could not be sealed: ${error.message}`,
      );
    }

    const payload = mutationPayload(
      data,
      'reward boost source seal',
    );
    sourceResults.push(payload);
    if (payload.changed === true) {
      sourceSweepsChanged += 1;
    }
  }

  // Re-read the physical pool after source accounting changes. Source sweeps
  // are logical only, but this avoids using stale chain state if settlement
  // happened while the source loop was running.
  const releasePool =
    await readVeInviteRewardPoolStatus();

  if (
    releasePool.network !== pool.network ||
    releasePool.appId !== pool.appId
  ) {
    throw new Error(
      'Reward boost reserve pool changed during execution.',
    );
  }
  if (releasePool.distributionPaused) {
    throw new Error(
      'Reward boost reserve release stopped because distribution became paused.',
    );
  }

  const {
    data: destinationData,
    error: destinationError,
  } = await supabaseAdmin.rpc(
    'seal_and_release_reward_boost_destination',
    {
      p_network: releasePool.network,
      p_app_id: releasePool.appId,
      p_observed_pool_balance_wei:
        releasePool.effectiveRewardPoolWei,
      p_policy_version:
        REWARD_BOOST_RESERVE_POLICY_VERSION,
    },
  );

  if (destinationError) {
    throw new Error(
      `Reward boost destination could not be released: ${destinationError.message}`,
    );
  }

  const destinationResult = mutationPayload(
    destinationData,
    'reward boost destination release',
  );

  const forecast =
    destinationResult.changed === true
      ? await refreshRewardForecastSnapshot({
          network: releasePool.network,
          appId: releasePool.appId,
        })
      : null;

  return {
    enabled: true,
    network: releasePool.network,
    appId: releasePool.appId,
    sourceCandidates: sources.length,
    sourceSweepsChanged,
    sourceResults,
    destinationResult,
    forecast,
  };
}
