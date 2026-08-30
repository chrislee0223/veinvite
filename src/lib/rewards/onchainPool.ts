import { ThorClient } from '@vechain/sdk-network';

import {
  readRewardRuntimeSafety,
} from '@/lib/rewards/runtimeSafety';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

export const VEINVITE_APP_ID =
  '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
export const VEINVITE_EXPECTED_TEAM_ALLOCATION_PERCENTAGE = '20';
export const VEINVITE_EXPECTED_USER_REWARD_PERCENTAGE = '80';

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const INTEGER_PATTERN = /^\d+$/;

const rewardsPoolAbi = [
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'isRewardsPoolEnabled',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'rewardsPoolBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'availableFunds',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'totalBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'isDistributionPaused',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'version',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'pure',
    type: 'function',
  },
] as const;

const x2EarnAppsAbi = [
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'appAdmin',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'rewardDistributors',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'teamAllocationPercentage',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function firstValue(
  result: readonly unknown[],
  fieldName: string,
): unknown {
  if (result.length < 1) {
    throw new Error(
      `VeBetterDAO ${fieldName} returned no value.`,
    );
  }

  return result[0];
}

function readBoolean(
  result: readonly unknown[],
  fieldName: string,
): boolean {
  const value = firstValue(result, fieldName);

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(
    `VeBetterDAO ${fieldName} returned an invalid boolean.`,
  );
}

function readIntegerString(
  result: readonly unknown[],
  fieldName: string,
): string {
  const value = String(
    firstValue(result, fieldName),
  );

  if (!INTEGER_PATTERN.test(value)) {
    throw new Error(
      `VeBetterDAO ${fieldName} returned an invalid integer.`,
    );
  }

  return BigInt(value).toString();
}

function readAddress(
  result: readonly unknown[],
  fieldName: string,
): string {
  const value = String(
    firstValue(result, fieldName),
  ).toLowerCase();

  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(
      `VeBetterDAO ${fieldName} returned an invalid address.`,
    );
  }

  return value;
}

function readAddressArray(
  result: readonly unknown[],
  fieldName: string,
): string[] {
  const value = firstValue(result, fieldName);

  if (!Array.isArray(value)) {
    throw new Error(
      `VeBetterDAO ${fieldName} returned an invalid address list.`,
    );
  }

  return value.map((entry) => {
    const address = String(entry).toLowerCase();

    if (!ADDRESS_PATTERN.test(address)) {
      throw new Error(
        `VeBetterDAO ${fieldName} contains an invalid address.`,
      );
    }

    return address;
  });
}

function readString(
  result: readonly unknown[],
  fieldName: string,
): string {
  const value = String(
    firstValue(result, fieldName),
  ).trim();

  if (!value) {
    throw new Error(
      `VeBetterDAO ${fieldName} returned an empty string.`,
    );
  }

  return value;
}

export type VeInviteRewardPoolStatus = {
  network: string;
  appId: string;
  x2EarnRewardsPoolAddress: string;
  rewardsPoolEnabled: boolean;
  rewardsPoolBalanceWei: string;
  availableFundsWei: string;
  totalBalanceWei: string;
  effectiveRewardPoolWei: string;
  onChainDistributionPaused: boolean;
  emergencyRewardsPaused: boolean;
  emergencyPauseReason: string | null;
  distributionPaused: boolean;
  contractVersion: string;
  appAdmin: string;
  rewardDistributors: string[];
  teamAllocationPercentage: string;
  userRewardPercentage: string;
};

/**
 * Reads the app-scoped VeBetterDAO reward pool plus VeInvite's local runtime
 * safety gate. No database writes or token transfers are performed here.
 *
 * VeBetterDAO v7+ separates rewardsPoolBalance from availableFunds when the
 * dual-pool feature is enabled. The active pool is therefore selected from the
 * contract flag instead of an operator-supplied balance.
 *
 * The configured VeBetterDAO team allocation is also treated as a hard reward
 * policy invariant. VeInvite is designed for 20% team / 80% user rewards. If
 * the live app setting drifts, this reader throws so every reward operation
 * that depends on it fails closed before any financial plan or signing step.
 *
 * `distributionPaused` is deliberately effective/fail-closed: either the
 * on-chain VeBetterDAO pause or VeInvite's operator emergency pause blocks new
 * reward preparation/signing paths. Existing submitted transactions may still
 * be reconciled and finalized so accounting evidence is never lost.
 */
export async function readVeInviteRewardPoolStatus():
Promise<VeInviteRewardPoolStatus> {
  const {
    network,
    nodeUrl,
    x2EarnAppsAddress,
    x2EarnRewardsPoolAddress,
  } = getVeBetterNetworkConfig();

  const thor = ThorClient.at(nodeUrl);
  const pool = thor.contracts.load(
    x2EarnRewardsPoolAddress,
    rewardsPoolAbi,
  );
  const apps = thor.contracts.load(
    x2EarnAppsAddress,
    x2EarnAppsAbi,
  );

  const [
    enabledResult,
    rewardsBalanceResult,
    availableFundsResult,
    totalBalanceResult,
    pausedResult,
    versionResult,
    appAdminResult,
    distributorsResult,
    teamAllocationResult,
    runtimeSafety,
  ] = await Promise.all([
    pool.read.isRewardsPoolEnabled(
      VEINVITE_APP_ID,
    ),
    pool.read.rewardsPoolBalance(
      VEINVITE_APP_ID,
    ),
    pool.read.availableFunds(
      VEINVITE_APP_ID,
    ),
    pool.read.totalBalance(
      VEINVITE_APP_ID,
    ),
    pool.read.isDistributionPaused(
      VEINVITE_APP_ID,
    ),
    pool.read.version(),
    apps.read.appAdmin(
      VEINVITE_APP_ID,
    ),
    apps.read.rewardDistributors(
      VEINVITE_APP_ID,
    ),
    apps.read.teamAllocationPercentage(
      VEINVITE_APP_ID,
    ),
    readRewardRuntimeSafety(),
  ]);

  const rewardsPoolEnabled =
    readBoolean(
      enabledResult,
      'isRewardsPoolEnabled',
    );
  const rewardsPoolBalanceWei =
    readIntegerString(
      rewardsBalanceResult,
      'rewardsPoolBalance',
    );
  const availableFundsWei =
    readIntegerString(
      availableFundsResult,
      'availableFunds',
    );
  const totalBalanceWei =
    readIntegerString(
      totalBalanceResult,
      'totalBalance',
    );
  const teamAllocationPercentage =
    readIntegerString(
      teamAllocationResult,
      'teamAllocationPercentage',
    );
  const teamPercentage =
    BigInt(teamAllocationPercentage);

  if (teamPercentage > 100n) {
    throw new Error(
      'VeBetterDAO team allocation percentage exceeds 100%.',
    );
  }

  const userRewardPercentage =
    (100n - teamPercentage).toString();

  if (
    teamAllocationPercentage !==
      VEINVITE_EXPECTED_TEAM_ALLOCATION_PERCENTAGE ||
    userRewardPercentage !==
      VEINVITE_EXPECTED_USER_REWARD_PERCENTAGE
  ) {
    throw new Error(
      `VeInvite reward allocation policy mismatch: expected ${VEINVITE_EXPECTED_TEAM_ALLOCATION_PERCENTAGE}% team / ${VEINVITE_EXPECTED_USER_REWARD_PERCENTAGE}% users, received ${teamAllocationPercentage}% team / ${userRewardPercentage}% users.`,
    );
  }

  const effectiveRewardPoolWei =
    rewardsPoolEnabled
      ? rewardsPoolBalanceWei
      : availableFundsWei;
  const onChainDistributionPaused =
    readBoolean(
      pausedResult,
      'isDistributionPaused',
    );
  const distributionPaused =
    onChainDistributionPaused ||
    runtimeSafety.emergencyRewardsPaused;

  if (
    BigInt(effectiveRewardPoolWei) >
    BigInt(totalBalanceWei)
  ) {
    throw new Error(
      'VeBetterDAO reward pool balance exceeds total app balance.',
    );
  }

  return {
    network,
    appId: VEINVITE_APP_ID,
    x2EarnRewardsPoolAddress,
    rewardsPoolEnabled,
    rewardsPoolBalanceWei,
    availableFundsWei,
    totalBalanceWei,
    effectiveRewardPoolWei,
    onChainDistributionPaused,
    emergencyRewardsPaused:
      runtimeSafety.emergencyRewardsPaused,
    emergencyPauseReason:
      runtimeSafety.emergencyPauseReason,
    distributionPaused,
    contractVersion:
      readString(
        versionResult,
        'version',
      ),
    appAdmin:
      readAddress(
        appAdminResult,
        'appAdmin',
      ),
    rewardDistributors:
      readAddressArray(
        distributorsResult,
        'rewardDistributors',
      ),
    teamAllocationPercentage,
    userRewardPercentage,
  };
}

export function canOperateVeInviteRewards(
  walletAddress: string,
  status: VeInviteRewardPoolStatus,
): boolean {
  const normalized = walletAddress.toLowerCase();

  return (
    normalized === status.appAdmin &&
    status.rewardDistributors.includes(normalized)
  );
}
