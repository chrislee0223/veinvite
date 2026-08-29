import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const VTHO_ADDRESS =
  '0x0000000000000000000000000000456e65726779';
const APPROX_BLOCK_SECONDS = 10;
const SIX_HOURS_BLOCKS = Math.floor(
  (6 * 60 * 60) / APPROX_BLOCK_SECONDS,
);
const ONE_HOUR_BLOCKS = Math.floor(
  (60 * 60) / APPROX_BLOCK_SECONDS,
);

const vthoAbi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'from',
        type: 'address',
      },
      {
        indexed: true,
        name: 'to',
        type: 'address',
      },
      {
        indexed: false,
        name: 'value',
        type: 'uint256',
      },
    ],
    name: 'Transfer',
    type: 'event',
  },
] as const;

export type FundingTransferObservation = {
  blockNumber: number;
  sender: string | null;
  recipient: string | null;
  txId: string | null;
  asset: 'VET' | 'VTHO';
};

export type OnchainFundingSnapshot = {
  walletAddress: string;
  network: VeBetterNetwork;
  activationBlock: number;
  firstObservedActivityBlock: number | null;
  ageBlocksAtActivation: number | null;
  approximateAgeSecondsAtActivation: number | null;
  firstInboundVet: FundingTransferObservation | null;
  firstOutboundVet: FundingTransferObservation | null;
  firstInboundVtho: FundingTransferObservation | null;
  firstOutboundVtho: FundingTransferObservation | null;
  checkedAt: string;
};

export type OnchainRiskIndicator = {
  code:
    | 'VERY_NEW_WALLET_ACTIVITY'
    | 'NEW_WALLET_ACTIVITY'
    | 'SAME_FUNDER_MULTI_ASSET'
    | 'SHARED_VET_FUNDER'
    | 'SHARED_VTHO_FUNDER';
  level: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  message: string;
};

export type OnchainCorrelationContext = {
  vetFunderReferralCount: number;
  vthoFunderReferralCount: number;
};

export type OnchainAnalyticsResult = {
  snapshot: OnchainFundingSnapshot;
  indicators: OnchainRiskIndicator[];
  correlation: OnchainCorrelationContext;
  observationOnly: true;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null
    ? (value as UnknownRecord)
    : null;
}

function readNestedRecord(
  record: UnknownRecord,
  key: string,
): UnknownRecord | null {
  return asRecord(record[key]);
}

function readString(
  record: UnknownRecord | null,
  ...keys: string[]
): string | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

function readInteger(
  record: UnknownRecord | null,
  ...keys: string[]
): number | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d+$/.test(value)
          ? Number(value)
          : null;

    if (
      parsed !== null &&
      Number.isSafeInteger(parsed) &&
      parsed >= 0
    ) {
      return parsed;
    }
  }

  return null;
}

function normalizeAddress(value: string | null) {
  return value && ADDRESS_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function parseBlockNumber(value: unknown): number | null {
  const record = asRecord(value);
  const meta = record
    ? readNestedRecord(record, 'meta')
    : null;

  return (
    readInteger(record, 'blockNumber', 'block_number') ??
    readInteger(meta, 'blockNumber', 'block_number')
  );
}

function parseTxId(value: unknown): string | null {
  const record = asRecord(value);
  const meta = record
    ? readNestedRecord(record, 'meta')
    : null;

  return (
    readString(record, 'txID', 'txId', 'transactionId') ??
    readString(meta, 'txID', 'txId', 'transactionId')
  );
}

function parseVetTransfer(
  value: unknown,
): FundingTransferObservation | null {
  const record = asRecord(value);
  if (!record) return null;

  const blockNumber = parseBlockNumber(value);
  if (blockNumber === null) return null;

  return {
    blockNumber,
    sender: normalizeAddress(
      readString(record, 'sender', 'from'),
    ),
    recipient: normalizeAddress(
      readString(record, 'recipient', 'to'),
    ),
    txId: parseTxId(value),
    asset: 'VET',
  };
}

function parseVthoTransfer(
  value: unknown,
): FundingTransferObservation | null {
  const record = asRecord(value);
  if (!record) return null;

  const decoded =
    readNestedRecord(record, 'decodedData') ??
    readNestedRecord(record, 'decoded') ??
    record;
  const blockNumber = parseBlockNumber(value);

  if (blockNumber === null) return null;

  return {
    blockNumber,
    sender: normalizeAddress(
      readString(decoded, 'from', '_from', 'sender'),
    ),
    recipient: normalizeAddress(
      readString(decoded, 'to', '_to', 'recipient'),
    ),
    txId: parseTxId(value),
    asset: 'VTHO',
  };
}

function firstBlock(
  ...observations: Array<FundingTransferObservation | null>
) {
  const blocks = observations
    .filter(
      (value): value is FundingTransferObservation =>
        Boolean(value),
    )
    .map((value) => value.blockNumber);

  return blocks.length > 0 ? Math.min(...blocks) : null;
}

function validateInputs(
  walletAddress: string,
  activationBlock: number,
) {
  if (!ADDRESS_PATTERN.test(walletAddress)) {
    throw new Error(
      'On-chain analytics received an invalid wallet address.',
    );
  }

  if (
    !Number.isSafeInteger(activationBlock) ||
    activationBlock <= 0
  ) {
    throw new Error(
      'On-chain analytics requires a positive activation block.',
    );
  }
}

export async function readOnchainFundingSnapshot({
  walletAddress,
  activationBlock,
}: {
  walletAddress: string;
  activationBlock: number;
}): Promise<OnchainFundingSnapshot> {
  validateInputs(walletAddress, activationBlock);

  const normalizedWallet = walletAddress.toLowerCase();
  const { network, nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const vtho = thor.contracts.load(VTHO_ADDRESS, vthoAbi);
  const range = {
    unit: 'block' as const,
    from: 0,
    to: activationBlock,
  };
  const options = { offset: 0, limit: 1 };

  const [
    inboundVetLogs,
    outboundVetLogs,
    inboundVthoLogs,
    outboundVthoLogs,
  ] = await Promise.all([
    thor.logs.filterTransferLogs({
      criteriaSet: [{ recipient: normalizedWallet }],
      range,
      options,
      order: 'asc',
    }),
    thor.logs.filterTransferLogs({
      criteriaSet: [{ sender: normalizedWallet }],
      range,
      options,
      order: 'asc',
    }),
    vtho.filters.Transfer(null, normalizedWallet).get({
      range,
      options,
      order: 'asc',
    }),
    vtho.filters.Transfer(normalizedWallet, null).get({
      range,
      options,
      order: 'asc',
    }),
  ]);

  const firstInboundVet =
    parseVetTransfer(inboundVetLogs[0]);
  const firstOutboundVet =
    parseVetTransfer(outboundVetLogs[0]);
  const firstInboundVtho =
    parseVthoTransfer(inboundVthoLogs[0]);
  const firstOutboundVtho =
    parseVthoTransfer(outboundVthoLogs[0]);
  const firstObservedActivityBlock = firstBlock(
    firstInboundVet,
    firstOutboundVet,
    firstInboundVtho,
    firstOutboundVtho,
  );
  const ageBlocksAtActivation =
    firstObservedActivityBlock === null
      ? null
      : Math.max(
          0,
          activationBlock - firstObservedActivityBlock,
        );

  return {
    walletAddress: normalizedWallet,
    network,
    activationBlock,
    firstObservedActivityBlock,
    ageBlocksAtActivation,
    approximateAgeSecondsAtActivation:
      ageBlocksAtActivation === null
        ? null
        : ageBlocksAtActivation * APPROX_BLOCK_SECONDS,
    firstInboundVet,
    firstOutboundVet,
    firstInboundVtho,
    firstOutboundVtho,
    checkedAt: new Date().toISOString(),
  };
}

export function evaluateOnchainFundingIndicators({
  snapshot,
  correlation,
}: {
  snapshot: OnchainFundingSnapshot;
  correlation: OnchainCorrelationContext;
}): OnchainAnalyticsResult {
  const indicators: OnchainRiskIndicator[] = [];
  const ageBlocks = snapshot.ageBlocksAtActivation;

  if (ageBlocks !== null && ageBlocks <= ONE_HOUR_BLOCKS) {
    indicators.push({
      code: 'VERY_NEW_WALLET_ACTIVITY',
      level: 'MEDIUM',
      score: 30,
      message:
        'The earliest observed VET/VTHO transfer activity was within approximately one hour of invitation activation.',
    });
  } else if (
    ageBlocks !== null &&
    ageBlocks <= SIX_HOURS_BLOCKS
  ) {
    indicators.push({
      code: 'NEW_WALLET_ACTIVITY',
      level: 'LOW',
      score: 15,
      message:
        'The earliest observed VET/VTHO transfer activity was within approximately six hours of invitation activation.',
    });
  }

  const vetFunder = snapshot.firstInboundVet?.sender ?? null;
  const vthoFunder = snapshot.firstInboundVtho?.sender ?? null;

  if (
    vetFunder &&
    vthoFunder &&
    vetFunder === vthoFunder
  ) {
    indicators.push({
      code: 'SAME_FUNDER_MULTI_ASSET',
      level: 'LOW',
      score: 10,
      message:
        'The first observed inbound VET and VTHO transfers came from the same wallet.',
    });
  }

  if (correlation.vetFunderReferralCount >= 3) {
    indicators.push({
      code: 'SHARED_VET_FUNDER',
      level:
        correlation.vetFunderReferralCount >= 5
          ? 'HIGH'
          : 'MEDIUM',
      score: Math.min(
        70,
        20 + correlation.vetFunderReferralCount * 10,
      ),
      message:
        `The first inbound VET funder is shared by ${correlation.vetFunderReferralCount} observed VeInvite referrals.`,
    });
  }

  if (correlation.vthoFunderReferralCount >= 3) {
    indicators.push({
      code: 'SHARED_VTHO_FUNDER',
      level:
        correlation.vthoFunderReferralCount >= 5
          ? 'HIGH'
          : 'MEDIUM',
      score: Math.min(
        70,
        20 + correlation.vthoFunderReferralCount * 10,
      ),
      message:
        `The first inbound VTHO funder is shared by ${correlation.vthoFunderReferralCount} observed VeInvite referrals.`,
    });
  }

  return {
    snapshot,
    indicators,
    correlation,
    observationOnly: true,
  };
}
