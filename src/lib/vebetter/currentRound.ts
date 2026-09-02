import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const currentRoundAbi = [
  {
    inputs: [],
    name: 'currentRoundId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type CurrentVeBetterRound = {
  network: VeBetterNetwork;
  currentRoundId: number;
};

function toSafeRoundId(value: unknown): number {
  let parsed: number;

  if (typeof value === 'bigint') {
    parsed = Number(value);
  } else if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    parsed = Number(value);
  } else {
    throw new Error('Current VeBetterDAO round id has an unsupported value type.');
  }

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('Current VeBetterDAO round id is invalid.');
  }

  return parsed;
}

export async function readCurrentVeBetterRound(): Promise<CurrentVeBetterRound> {
  const {
    network,
    nodeUrl,
    xAllocationVotingAddress,
  } = getVeBetterNetworkConfig();

  const thor = ThorClient.at(nodeUrl);
  const contract = thor.contracts.load(
    xAllocationVotingAddress,
    currentRoundAbi,
  );
  const result = await contract.read.currentRoundId();

  return {
    network,
    currentRoundId: toSafeRoundId(result[0]),
  };
}
