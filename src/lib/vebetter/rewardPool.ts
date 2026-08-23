import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const APP_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const X2EARN_REWARDS_POOL_READ_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'appId',
        type: 'bytes32',
      },
    ],
    name: 'rewardsPoolBalance',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'appId',
        type: 'bytes32',
      },
    ],
    name: 'availableFunds',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'appId',
        type: 'bytes32',
      },
    ],
    name: 'totalBalance',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'appId',
        type: 'bytes32',
      },
    ],
    name: 'isRewardsPoolEnabled',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'appId',
        type: 'bytes32',
      },
    ],
    name: 'isDistributionPaused',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type RewardPoolSnapshot = {
  network: 'mainnet' | 'testnet';
  appId: string;
  rewardsPoolAddress: string;
  rewardsPoolBalanceWei: string;
  availableFundsWei: string;
  totalBalanceWei: string;
  rewardsPoolEnabled: boolean;
  distributionPaused: boolean;
};

function normalizeAppId(appId: string): string {
  const normalized = appId.trim().toLowerCase();

  if (!APP_ID_PATTERN.test(normalized)) {
    throw new Error(
      'VEBETTER_APP_ID must be a 32-byte hex value.',
    );
  }

  return normalized;
}

function requireBigInt(
  value: unknown,
  fieldName: string,
): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return BigInt(value);
  }

  if (
    typeof value === 'string' &&
    /^\d+$/.test(value)
  ) {
    return BigInt(value);
  }

  throw new Error(
    `${fieldName} returned an unexpected value.`,
  );
}

function requireBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(
      `${fieldName} returned an unexpected value.`,
    );
  }

  return value;
}

export async function getRewardPoolSnapshot(
  rawAppId: string,
): Promise<RewardPoolSnapshot> {
  const appId = normalizeAppId(rawAppId);
  const {
    network,
    nodeUrl,
    x2EarnRewardsPoolAddress,
  } = getVeBetterNetworkConfig();

  const thor = ThorClient.at(nodeUrl);
  const contract = thor.contracts.load(
    x2EarnRewardsPoolAddress,
    X2EARN_REWARDS_POOL_READ_ABI,
  );

  const [
    rewardsPoolResult,
    availableFundsResult,
    totalBalanceResult,
    rewardsPoolEnabledResult,
    distributionPausedResult,
  ] = await Promise.all([
    contract.read.rewardsPoolBalance(appId),
    contract.read.availableFunds(appId),
    contract.read.totalBalance(appId),
    contract.read.isRewardsPoolEnabled(appId),
    contract.read.isDistributionPaused(appId),
  ]);

  if (
    !rewardsPoolResult ||
    !availableFundsResult ||
    !totalBalanceResult ||
    !rewardsPoolEnabledResult ||
    !distributionPausedResult
  ) {
    throw new Error(
      'Failed to read one or more VeBetter rewards pool values.',
    );
  }

  return {
    network,
    appId,
    rewardsPoolAddress:
      x2EarnRewardsPoolAddress,
    rewardsPoolBalanceWei:
      requireBigInt(
        rewardsPoolResult[0],
        'rewardsPoolBalance',
      ).toString(),
    availableFundsWei:
      requireBigInt(
        availableFundsResult[0],
        'availableFunds',
      ).toString(),
    totalBalanceWei:
      requireBigInt(
        totalBalanceResult[0],
        'totalBalance',
      ).toString(),
    rewardsPoolEnabled:
      requireBoolean(
        rewardsPoolEnabledResult[0],
        'isRewardsPoolEnabled',
      ),
    distributionPaused:
      requireBoolean(
        distributionPausedResult[0],
        'isDistributionPaused',
      ),
  };
}
