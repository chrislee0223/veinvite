import { ThorClient } from '@vechain/sdk-network';
import { NextResponse } from 'next/server';

import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const VEINVITE_APP_ID =
  '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';

const x2EarnAppsAbi = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'appId',
        type: 'bytes32',
      },
    ],
    name: 'appAdmin',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
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
    name: 'teamWalletAddress',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
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
    name: 'teamAllocationPercentage',
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
    name: 'rewardDistributors',
    outputs: [
      {
        internalType: 'address[]',
        name: '',
        type: 'address[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function firstString(
  value: readonly unknown[],
): string {
  return String(value[0]);
}

export async function GET() {
  try {
    const {
      network,
      nodeUrl,
      x2EarnAppsAddress,
    } = getVeBetterNetworkConfig();

    const thor = ThorClient.at(nodeUrl);
    const apps = thor.contracts.load(
      x2EarnAppsAddress,
      x2EarnAppsAbi,
    );

    const [
      appAdmin,
      teamWallet,
      teamAllocationPercentage,
      rewardDistributors,
    ] = await Promise.all([
      apps.read.appAdmin(VEINVITE_APP_ID),
      apps.read.teamWalletAddress(
        VEINVITE_APP_ID,
      ),
      apps.read.teamAllocationPercentage(
        VEINVITE_APP_ID,
      ),
      apps.read.rewardDistributors(
        VEINVITE_APP_ID,
      ),
    ]);

    const distributors =
      (rewardDistributors[0] as string[]).map(
        (address) => address.toLowerCase(),
      );

    return NextResponse.json(
      {
        network,
        appId: VEINVITE_APP_ID,
        x2EarnAppsAddress,
        appAdmin: firstString(
          appAdmin,
        ).toLowerCase(),
        teamWallet: firstString(
          teamWallet,
        ).toLowerCase(),
        teamAllocationPercentage:
          Number(
            firstString(
              teamAllocationPercentage,
            ),
          ),
        rewardDistributors: distributors,
        targetTeamAllocationPercentage: 20,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Funding configuration read failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Funding configuration could not be loaded.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
