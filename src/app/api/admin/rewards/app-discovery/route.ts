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

const APP_TUPLE_COMPONENTS = [
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
        components: APP_TUPLE_COMPONENTS,
        internalType:
          'struct X2EarnAppsDataTypes.AppWithDetailsReturnType',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'apps',
    outputs: [
      {
        components: APP_TUPLE_COMPONENTS,
        internalType:
          'struct X2EarnAppsDataTypes.AppWithDetailsReturnType[]',
        name: '',
        type: 'tuple[]',
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

type DiscoveredApp = {
  appId: string;
  registeredName: string;
  teamWalletAddress: string;
  createdAtTimestamp: string;
  appAvailableForAllocationVoting: boolean;
  rewardPool: Awaited<ReturnType<typeof getRewardPoolSnapshot>>;
};

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

async function toDiscoveredApp(
  tuple: AppTuple,
): Promise<DiscoveredApp> {
  const [
    appId,
    teamWalletAddress,
    registeredName,
    _metadataURI,
    createdAtTimestamp,
    appAvailableForAllocationVoting,
  ] = tuple;

  return {
    appId,
    registeredName,
    teamWalletAddress,
    createdAtTimestamp:
      createdAtTimestamp.toString(),
    appAvailableForAllocationVoting,
    rewardPool:
      await getRewardPoolSnapshot(appId),
  };
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

  const candidateAttempts = [] as Array<{
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

      if (
        !tuple ||
        tuple[0].toLowerCase() !== appId.toLowerCase()
      ) {
        candidateAttempts.push({
          candidateName,
          appId,
          exists: false,
        });
        continue;
      }

      const discovered =
        await toDiscoveredApp(tuple);

      candidateAttempts.push({
        candidateName,
        exists: true,
        ...discovered,
      });
    } catch {
      candidateAttempts.push({
        candidateName,
        appId,
        exists: false,
      });
    }
  }

  let registryScanned = false;
  let registryAppCount: number | null = null;
  const registryMatches: DiscoveredApp[] = [];

  try {
    const registryResult =
      await contract.read.apps();
    const rawApps = registryResult?.[0];

    if (Array.isArray(rawApps)) {
      registryScanned = true;
      registryAppCount = rawApps.length;

      for (const rawApp of rawApps) {
        const tuple = parseAppTuple(rawApp);

        if (!tuple) {
          continue;
        }

        const registeredName =
          tuple[2].trim().toLowerCase();

        if (!registeredName.includes('invite')) {
          continue;
        }

        try {
          registryMatches.push(
            await toDiscoveredApp(tuple),
          );
        } catch {
          // If a pool read fails, do not claim the app is safe to use.
        }
      }
    }
  } catch {
    registryScanned = false;
  }

  const directMatches =
    candidateAttempts.filter(
      (attempt) => attempt.exists,
    );

  const uniqueMatches = new Map<string, unknown>();

  for (const match of [
    ...directMatches,
    ...registryMatches,
  ]) {
    uniqueMatches.set(
      match.appId.toLowerCase(),
      match,
    );
  }

  return NextResponse.json(
    {
      mode: 'READ_ONLY_APP_DISCOVERY',
      network,
      x2EarnAppsAddress,
      writesPerformed: false,
      transfersPerformed: false,
      candidateCount:
        CANDIDATE_APP_NAMES.length,
      registryScanned,
      registryAppCount,
      matchCount: uniqueMatches.size,
      matches:
        Array.from(uniqueMatches.values()),
      candidateAttempts,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
