import { ABIFunction } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const VEBETTER_PASSPORT_MAINNET =
  '0x35a267671d8EDD607B2056A9a13E7ba7CF53c8b3';

const signaledCounterFunction = new ABIFunction({
  constant: true,
  inputs: [
    {
      name: '_user',
      type: 'address',
    },
  ],
  name: 'signaledCounter',
  outputs: [
    {
      name: '',
      type: 'uint256',
    },
  ],
  payable: false,
  stateMutability: 'view',
  type: 'function',
});

export type BotSignalObservation = {
  network: VeBetterNetwork;
  walletAddress: string;
  available: boolean;
  signalCount: number | null;
  checkedAt: string;
  source: 'VEBETTER_PASSPORT';
};

type SimulationResult = {
  data?: string;
  reverted?: boolean;
  vmError?: string;
};

function normalizeAddress(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(
      'Invalid wallet address for bot signal observation.',
    );
  }

  return normalized;
}

function decodeUint256(value: string | undefined): number {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      'VeBetterPassport returned malformed signal data.',
    );
  }

  const parsed = BigInt(value);

  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      'VeBetterPassport signal count exceeds the supported range.',
    );
  }

  return Number(parsed);
}

/**
 * Read-only observation of VeBetterPassport bot signaling.
 *
 * This deliberately does not block, clear, or signal any wallet. It only
 * collects one additional fraud signal so VeInvite can evaluate false-positive
 * behavior before making it part of an enforcement decision.
 */
export async function observeVeBetterBotSignals(
  rawWalletAddress: string,
): Promise<BotSignalObservation> {
  const walletAddress =
    normalizeAddress(rawWalletAddress);
  const { network, nodeUrl } =
    getVeBetterNetworkConfig();
  const checkedAt = new Date().toISOString();

  // The currently reviewed VeBetter documentation publishes the mainnet
  // passport address. Do not silently query mainnet while a Preview is using a
  // test network; mark the signal unavailable instead.
  if (network !== 'mainnet') {
    return {
      network,
      walletAddress,
      available: false,
      signalCount: null,
      checkedAt,
      source: 'VEBETTER_PASSPORT',
    };
  }

  const thor = ThorClient.at(nodeUrl);
  const data = signaledCounterFunction
    .encodeData([walletAddress])
    .toString();

  const simulation =
    (await thor.transactions.simulateTransaction([
      {
        to: VEBETTER_PASSPORT_MAINNET,
        value: '0',
        data,
      },
    ])) as SimulationResult[];

  const result = simulation[0];

  if (!result) {
    throw new Error(
      'VeBetterPassport signal observation returned no result.',
    );
  }

  if (result.reverted) {
    throw new Error(
      result.vmError
        ? `VeBetterPassport signal observation reverted: ${result.vmError}`
        : 'VeBetterPassport signal observation reverted.',
    );
  }

  return {
    network,
    walletAddress,
    available: true,
    signalCount: decodeUint256(result.data),
    checkedAt,
    source: 'VEBETTER_PASSPORT',
  };
}
