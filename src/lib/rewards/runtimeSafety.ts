import { supabaseAdmin } from '@/lib/supabaseServer';

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const ALLOWED_NETWORKS = new Set([
  'mainnet',
  'testnet',
  'testnet-staging',
]);

export type RewardRuntimeSafety = {
  mainnetFundedRewardsEnabled: boolean;
  emergencyRewardsPaused: boolean;
  emergencyPauseReason: string | null;
  emergencyPauseChangedAt: string | null;
  emergencyPauseChangedBy: string | null;
  emergencyPauseNetwork: string | null;
};

type RuntimeConfigRow = {
  mainnet_funded_rewards_enabled: unknown;
  emergency_rewards_paused: unknown;
  emergency_pause_reason: unknown;
  emergency_pause_changed_at: unknown;
  emergency_pause_changed_by: unknown;
  emergency_pause_network: unknown;
};

function optionalString(
  value: unknown,
  label: string,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(
      `Reward runtime ${label} is malformed.`,
    );
  }

  const normalized = value.trim();

  return normalized || null;
}

export async function readRewardRuntimeSafety():
Promise<RewardRuntimeSafety> {
  const { data, error } =
    await supabaseAdmin
      .from('reward_runtime_config')
      .select(
        'mainnet_funded_rewards_enabled, emergency_rewards_paused, emergency_pause_reason, emergency_pause_changed_at, emergency_pause_changed_by, emergency_pause_network',
      )
      .eq('id', 1)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Reward runtime safety configuration could not be loaded: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      'Reward runtime safety configuration is missing.',
    );
  }

  const row = data as RuntimeConfigRow;

  if (
    typeof row.mainnet_funded_rewards_enabled !==
      'boolean' ||
    typeof row.emergency_rewards_paused !==
      'boolean'
  ) {
    throw new Error(
      'Reward runtime safety booleans are malformed.',
    );
  }

  const emergencyPauseReason =
    optionalString(
      row.emergency_pause_reason,
      'emergency pause reason',
    );
  const emergencyPauseChangedAt =
    optionalString(
      row.emergency_pause_changed_at,
      'emergency pause timestamp',
    );
  const emergencyPauseChangedBy =
    optionalString(
      row.emergency_pause_changed_by,
      'emergency pause operator',
    )?.toLowerCase() ?? null;
  const emergencyPauseNetwork =
    optionalString(
      row.emergency_pause_network,
      'emergency pause network',
    )?.toLowerCase() ?? null;

  if (
    emergencyPauseChangedBy &&
    !ADDRESS_PATTERN.test(
      emergencyPauseChangedBy,
    )
  ) {
    throw new Error(
      'Reward runtime emergency pause operator is invalid.',
    );
  }

  if (
    emergencyPauseNetwork &&
    !ALLOWED_NETWORKS.has(
      emergencyPauseNetwork,
    )
  ) {
    throw new Error(
      'Reward runtime emergency pause network is invalid.',
    );
  }

  if (
    row.emergency_rewards_paused &&
    !emergencyPauseReason
  ) {
    throw new Error(
      'Reward runtime emergency pause is active without a reason.',
    );
  }

  return {
    mainnetFundedRewardsEnabled:
      row.mainnet_funded_rewards_enabled,
    emergencyRewardsPaused:
      row.emergency_rewards_paused,
    emergencyPauseReason,
    emergencyPauseChangedAt,
    emergencyPauseChangedBy,
    emergencyPauseNetwork,
  };
}
