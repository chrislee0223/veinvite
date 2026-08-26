import { ThorClient } from '@vechain/sdk-network';
import { NextResponse } from 'next/server';

import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

const VEINVITE_APP_ID =
  '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';

const x2EarnAppsAbi = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'appId', type: 'bytes32' },
    ],
    name: 'appExists',
    outputs: [
      { internalType: 'bool', name: '', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'appId', type: 'bytes32' },
    ],
    name: 'appAdmin',
    outputs: [
      { internalType: 'address', name: '', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'appId', type: 'bytes32' },
    ],
    name: 'teamWalletAddress',
    outputs: [
      { internalType: 'address', name: '', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'appId', type: 'bytes32' },
    ],
    name: 'teamAllocationPercentage',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'appId', type: 'bytes32' },
    ],
    name: 'rewardDistributors',
    outputs: [
      { internalType: 'address[]', name: '', type: 'address[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const rewardsPoolAbi = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'appId', type: 'bytes32' },
    ],
    name: 'availableFunds',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'appId', type: 'bytes32' },
    ],
    name: 'rewardsPoolBalance',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'appId', type: 'bytes32' },
    ],
    name: 'isRewardsPoolEnabled',
    outputs: [
      { internalType: 'bool', name: '', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'appId', type: 'bytes32' },
    ],
    name: 'totalBalance',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(jsonSafe);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, jsonSafe(nested)]),
    );
  }

  return value;
}

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json(
      { error: 'Funding self-audit is disabled in Production.' },
      { status: 404 },
    );
  }

  const {
    network,
    nodeUrl,
    x2EarnAppsAddress,
    x2EarnRewardsPoolAddress,
  } = getVeBetterNetworkConfig();

  const thor = ThorClient.at(nodeUrl);
  const apps = thor.contracts.load(x2EarnAppsAddress, x2EarnAppsAbi);
  const pool = thor.contracts.load(x2EarnRewardsPoolAddress, rewardsPoolAbi);

  const [
    appExists,
    appAdmin,
    teamWallet,
    teamAllocationPercentage,
    rewardDistributors,
    availableFunds,
    rewardsPoolBalance,
    rewardsPoolEnabled,
    totalBalance,
  ] = await Promise.all([
    apps.read.appExists(VEINVITE_APP_ID),
    apps.read.appAdmin(VEINVITE_APP_ID),
    apps.read.teamWalletAddress(VEINVITE_APP_ID),
    apps.read.teamAllocationPercentage(VEINVITE_APP_ID),
    apps.read.rewardDistributors(VEINVITE_APP_ID),
    pool.read.availableFunds(VEINVITE_APP_ID),
    pool.read.rewardsPoolBalance(VEINVITE_APP_ID),
    pool.read.isRewardsPoolEnabled(VEINVITE_APP_ID),
    pool.read.totalBalance(VEINVITE_APP_ID),
  ]);

  return NextResponse.json({
    mode: 'READ_ONLY_FUNDING_SELF_AUDIT',
    writesPerformed: false,
    transfersPerformed: false,
    network,
    appId: VEINVITE_APP_ID,
    x2EarnAppsAddress,
    x2EarnRewardsPoolAddress,
    values: jsonSafe({
      appExists,
      appAdmin,
      teamWallet,
      teamAllocationPercentage,
      rewardDistributors,
      availableFunds,
      rewardsPoolBalance,
      rewardsPoolEnabled,
      totalBalance,
    }),
  });
}
