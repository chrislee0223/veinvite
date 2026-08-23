import { NextResponse } from 'next/server';
import { keccak256, toUtf8Bytes } from 'ethers';
import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';
import {
  getRewardPoolSnapshot,
} from '@/lib/vebetter/rewardPool';

const CANDIDATE_APP_NAMES = [
  'VeInvite',
  'Veinvite',
  'veinvite',
  'VEINVITE',
] as const;

const X2EARN_APPS_READ_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'appId',
        type: 'bytes32',
      },
    ],
    name: 'app',
    outputs: [
      {
        components: [
          {
            internalType: 'bytes32',
            name: 'id',
            type: 'bytes32',
          },
          {
            internalType: 'address',
            name: 'teamWalletAddress',
            type: 'address',
          },
          {
            internalType: 'string',
            name: 'name',
            type: 'string',
          },
          {
            internalType: 'string',
            name: 'metadataURI',
            type: 'string',
          },
          {
            internalType: 'uint256',
            name: 'createdAtTimestamp',
            type: 'uint256',
          },
          {
            internalType: 'bool',
            name: 'appAvailableForAllocationVoting',
            type: 'bool',
          },
        ],
        internalType:
          'struct X2EarnAppsDataTypes.AppWithDetailsReturnType',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

type AppIdHex = `0x${string}`;

type AppTuple = readonly [
  string,
  string,
  string,
  string,
  bigint,
  boolean,
];

function isProductionDeployment() {
  return process.env.VERCEL_ENV === 'production';
}

function appIdForName(name: string): AppIdHex {
  return keccak256(toUtf8Bytes(name)) as AppIdHex;
}

function parseAppTuple(value: unknown): AppTuple | null {
  if (!Array.isArray(value) || value.length < 6) {
    return null;
  }

  const [
    id,
    teamWalletAddress,
    name,
    metadataURI,
    createdAtTimestamp,
    appAvailableForAllocationVoting,
  ] = value;

  if (
    typeof id !== 'string' ||
    typeof teamWalletAddress !== 'string' ||
    typeof name !== 'string' ||
    typeof metadataURI !== 'string' ||
    typeof createdAtTimestamp !== 'bigint' ||
    typeof appAvailableForAllocationVoting !== 'boolean'
  ) {
    return null;
  }

  return [
    id,
    teamWalletAddress,
    name,
    metadataURI,
    createdAtTimestamp,
    appAvailableForAllocationVoting,
  ];
}

export async function GET() {
  if (isProductionDeployment()) {
    return NextResponse.json(
      {
        error:
          'App discovery is disabled in Production.',
      },
      { status: 403 },
    );
  }

  const {
    network,
    nodeUrl,
    x2EarnAppsAddress,
  } = getVeBetterNetworkConfig();

  if (network !== 'testnet') {
    return NextResponse.json(
      {
        error:
          'App discovery is restricted to VeChain testnet.',
        network,
      },
      { status: 403 },
    );
  }

  const thor = ThorClient.at(nodeUrl);
  const contract = thor.contracts.load(
    x2EarnAppsAddress,
    X2EARN_APPS_READ_ABI,
  );

  const attempts = [] as Array<{
    candidateName: string;
    appId: string;
    exists: boolean;
    registeredName?: string;
    teamWalletAddress?: string;
    createdAtTimestamp?: string;
    appAvailableForAllocationVoting?: boolean;
    rewardPool?: Awaited<ReturnType<typeof getRewardPoolSnapshot>>;
  }>;

  for (const candidateName of CANDIDATE_APP_NAMES) {
    const appId = appIdForName(candidateName);

    try {
      const result =
        await contract.read.app(appId);
      const tuple =
        parseAppTuple(result?.[0]);

      if (!tuple) {
        attempts.push({
          candidateName,
          appId,
          exists: false,
        });
        continue;
      }

      const [
        registeredId,
        teamWalletAddress,
        registeredName,
        _metadataURI,
        createdAtTimestamp,
        appAvailableForAllocationVoting,
      ] = tuple;

      if (
        registeredId.toLowerCase() !==
        appId.toLowerCase()
      ) {
        attempts.push({
          candidateName,
          appId,
          exists: false,
        });
        continue;
      }

      const rewardPool =
        await getRewardPoolSnapshot(appId);

      attempts.push({
        candidateName,
        appId,
        exists: true,
        registeredName,
        teamWalletAddress,
        createdAtTimestamp:
          createdAtTimestamp.toString(),
        appAvailableForAllocationVoting,
        rewardPool,
      });
    } catch {
      attempts.push({
        candidateName,
        appId,
        exists: false,
      });
    }
  }

  const matches =
    attempts.filter((attempt) => attempt.exists);

  return NextResponse.json(
    {
      mode: 'READ_ONLY_APP_DISCOVERY',
      network,
      x2EarnAppsAddress,
      writesPerformed: false,
      transfersPerformed: false,
      candidateCount:
        CANDIDATE_APP_NAMES.length,
      matchCount: matches.length,
      matches,
      attempts,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
