import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TX_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PAGE_SIZE = 1000;
const APPROX_BLOCK_SECONDS = 10;
const ONE_HOUR_BLOCKS = Math.floor(
  (60 * 60) / APPROX_BLOCK_SECONDS,
);
const ONE_DAY_BLOCKS = Math.floor(
  (24 * 60 * 60) / APPROX_BLOCK_SECONDS,
);

export type RecipientB3trTransferObservation = {
  blockNumber: number;
  txId: string;
  recipient: string;
  amountWei: string;
};

export type RecipientB3trFlowSnapshot = {
  recipientWallet: string;
  network: VeBetterNetwork;
  payoutBlockNumber: number;
  payoutAmountWei: string;
  scanToBlock: number;
  firstOutbound: RecipientB3trTransferObservation | null;
  firstOutboundBlocksAfterPayout: number | null;
  dominantDestination: string | null;
  dominantDestinationAmountWei: string;
  outboundTransferCount: number;
  distinctDestinationCount: number;
  totalOutboundAmountWei: string;
  knownProtocolDestination: boolean;
  checkedAt: string;
};

export type RecipientB3trFlowIndicator = {
  code:
    | 'RAPID_B3TR_OUTFLOW'
    | 'RAPID_LARGE_B3TR_SWEEP'
    | 'SHARED_B3TR_DESTINATION'
    | 'KNOWN_PROTOCOL_DESTINATION';
  level: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  message: string;
};

export type RecipientB3trFlowEvaluation = {
  indicators: RecipientB3trFlowIndicator[];
  sharedDestinationRecipientCount: number;
  observationOnly: true;
};

type RawEventLog = {
  data?: string;
  topics?: string[];
  meta?: {
    blockNumber?: number;
    txID?: string;
  };
};

function normalizeAddress(value: string) {
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(
      'B3TR recipient forensics received an invalid wallet address.',
    );
  }

  return value.toLowerCase();
}

function addressTopic(address: string) {
  const normalized = address.toLowerCase().replace(/^0x/, '');
  return `0x${'0'.repeat(24)}${normalized}`;
}

function addressFromTopic(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(value)
  ) {
    return null;
  }

  const address = `0x${value.slice(-40)}`.toLowerCase();
  return ADDRESS_PATTERN.test(address)
    ? address
    : null;
}

function parsePositiveAmountWei(log: RawEventLog) {
  const normalized =
    log.data?.toLowerCase().replace(/^0x/, '') ?? '';

  if (
    normalized.length < 64 ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(
      'B3TR transfer event is missing a valid amount.',
    );
  }

  const amount = BigInt(
    `0x${normalized.slice(0, 64)}`,
  );

  return amount > 0n ? amount : 0n;
}

function parseTransfer(
  log: RawEventLog,
): RecipientB3trTransferObservation | null {
  const blockNumber = log.meta?.blockNumber;
  const txId = log.meta?.txID?.toLowerCase();
  const recipient = addressFromTopic(log.topics?.[2]);

  if (
    typeof blockNumber !== 'number' ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0 ||
    !txId ||
    !TX_ID_PATTERN.test(txId) ||
    !recipient
  ) {
    throw new Error(
      'B3TR transfer event is missing valid chain metadata.',
    );
  }

  const amountWei = parsePositiveAmountWei(log);
  if (amountWei === 0n) return null;

  return {
    blockNumber,
    txId,
    recipient,
    amountWei: amountWei.toString(),
  };
}

function isKnownProtocolDestination(
  destination: string | null,
) {
  if (!destination) return false;

  const config = getVeBetterNetworkConfig();
  const known = new Set([
    '0x0000000000000000000000000000000000000000',
    config.b3trAddress.toLowerCase(),
    config.vot3Address.toLowerCase(),
    config.x2EarnAppsAddress.toLowerCase(),
    config.x2EarnRewardsPoolAddress.toLowerCase(),
    config.xAllocationVotingAddress.toLowerCase(),
  ]);

  return known.has(destination.toLowerCase());
}

function validatePayoutInputs(
  payoutBlockNumber: number,
  payoutAmountWei: string,
) {
  if (
    !Number.isSafeInteger(payoutBlockNumber) ||
    payoutBlockNumber < 0
  ) {
    throw new Error(
      'B3TR recipient forensics requires a valid payout block.',
    );
  }

  if (!/^\d+$/.test(payoutAmountWei)) {
    throw new Error(
      'B3TR recipient forensics requires an integer payout amount.',
    );
  }

  if (BigInt(payoutAmountWei) <= 0n) {
    throw new Error(
      'B3TR recipient forensics requires a positive payout amount.',
    );
  }
}

export async function readRecipientB3trFlowSnapshot({
  recipientWallet,
  payoutBlockNumber,
  payoutAmountWei,
}: {
  recipientWallet: string;
  payoutBlockNumber: number;
  payoutAmountWei: string;
}): Promise<RecipientB3trFlowSnapshot> {
  const wallet = normalizeAddress(recipientWallet);
  validatePayoutInputs(
    payoutBlockNumber,
    payoutAmountWei,
  );

  const config = getVeBetterNetworkConfig();
  const thor = ThorClient.at(config.nodeUrl);
  const bestBlock =
    await thor.blocks.getBestBlockCompressed();

  if (!bestBlock) {
    throw new Error(
      'Unable to load the latest VeChain block for B3TR recipient forensics.',
    );
  }

  const scanToBlock = bestBlock.number;
  const destinationTotals = new Map<string, bigint>();
  let firstOutbound: RecipientB3trTransferObservation | null = null;
  let totalOutboundAmountWei = 0n;
  let outboundTransferCount = 0;

  if (payoutBlockNumber < scanToBlock) {
    let offset = 0;

    while (true) {
      const logs =
        await thor.logs.filterRawEventLogs({
          range: {
            unit: 'block',
            from: payoutBlockNumber + 1,
            to: scanToBlock,
          },
          options: {
            offset,
            limit: PAGE_SIZE,
          },
          criteriaSet: [
            {
              address: config.b3trAddress,
              topic0: TRANSFER_TOPIC,
              topic1: addressTopic(wallet),
            },
          ],
          order: 'asc',
        });

      const rawLogs = logs as RawEventLog[];

      for (const rawLog of rawLogs) {
        const transfer = parseTransfer(rawLog);
        if (!transfer) continue;
        if (transfer.recipient === wallet) continue;

        if (!firstOutbound) {
          firstOutbound = transfer;
        }

        const amount = BigInt(transfer.amountWei);
        totalOutboundAmountWei += amount;
        outboundTransferCount += 1;
        destinationTotals.set(
          transfer.recipient,
          (destinationTotals.get(transfer.recipient) ?? 0n) +
            amount,
        );
      }

      if (rawLogs.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  const dominant = Array.from(
    destinationTotals.entries(),
  ).sort((left, right) => {
    if (left[1] === right[1]) {
      return left[0].localeCompare(right[0]);
    }
    return left[1] > right[1] ? -1 : 1;
  })[0] ?? null;

  const dominantDestination = dominant?.[0] ?? null;
  const firstOutboundBlocksAfterPayout =
    firstOutbound
      ? firstOutbound.blockNumber - payoutBlockNumber
      : null;

  return {
    recipientWallet: wallet,
    network: config.network,
    payoutBlockNumber,
    payoutAmountWei,
    scanToBlock,
    firstOutbound,
    firstOutboundBlocksAfterPayout,
    dominantDestination,
    dominantDestinationAmountWei:
      (dominant?.[1] ?? 0n).toString(),
    outboundTransferCount,
    distinctDestinationCount:
      destinationTotals.size,
    totalOutboundAmountWei:
      totalOutboundAmountWei.toString(),
    knownProtocolDestination:
      isKnownProtocolDestination(
        dominantDestination,
      ),
    checkedAt: new Date().toISOString(),
  };
}

export function evaluateRecipientB3trFlow({
  snapshot,
  sharedDestinationRecipientCount,
}: {
  snapshot: RecipientB3trFlowSnapshot;
  sharedDestinationRecipientCount: number;
}): RecipientB3trFlowEvaluation {
  if (
    !Number.isSafeInteger(sharedDestinationRecipientCount) ||
    sharedDestinationRecipientCount < 0
  ) {
    throw new Error(
      'Shared B3TR destination recipient count is invalid.',
    );
  }

  const indicators: RecipientB3trFlowIndicator[] = [];
  const blocksAfter =
    snapshot.firstOutboundBlocksAfterPayout;

  if (snapshot.knownProtocolDestination) {
    indicators.push({
      code: 'KNOWN_PROTOCOL_DESTINATION',
      level: 'INFO',
      score: 0,
      message:
        'The dominant direct B3TR destination is a reviewed VeBetter protocol address, so destination convergence is not treated as a Farmer signal.',
    });
  }

  if (
    blocksAfter !== null &&
    blocksAfter <= ONE_HOUR_BLOCKS
  ) {
    indicators.push({
      code: 'RAPID_B3TR_OUTFLOW',
      level: 'LOW',
      score: 10,
      message:
        'A direct B3TR outflow was observed within approximately one hour after the finalized VeInvite payout.',
    });
  }

  if (
    !snapshot.knownProtocolDestination &&
    snapshot.firstOutbound &&
    blocksAfter !== null &&
    blocksAfter <= ONE_DAY_BLOCKS &&
    BigInt(snapshot.firstOutbound.amountWei) * 100n >=
      BigInt(snapshot.payoutAmountWei) * 80n
  ) {
    indicators.push({
      code: 'RAPID_LARGE_B3TR_SWEEP',
      level: 'MEDIUM',
      score: 35,
      message:
        'The first direct B3TR outflow within approximately one day was at least 80% of the VeInvite payout amount. This is observation-only because token balances are fungible.',
    });
  }

  if (
    !snapshot.knownProtocolDestination &&
    snapshot.dominantDestination &&
    sharedDestinationRecipientCount >= 3
  ) {
    indicators.push({
      code: 'SHARED_B3TR_DESTINATION',
      level:
        sharedDestinationRecipientCount >= 5
          ? 'HIGH'
          : 'MEDIUM',
      score: Math.min(
        80,
        20 + sharedDestinationRecipientCount * 10,
      ),
      message:
        `The same dominant direct B3TR destination has been observed across ${sharedDestinationRecipientCount} distinct VeInvite reward-recipient wallets. Shared exchanges, routers, or custody wallets can create legitimate convergence, so this signal is never an automatic block.`,
    });
  }

  return {
    indicators,
    sharedDestinationRecipientCount,
    observationOnly: true,
  };
}
