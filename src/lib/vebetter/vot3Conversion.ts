import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const PAGE_SIZE = 1000;
const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000';

export const MIN_VOT3_CONVERSION_WEI =
  1_000_000_000_000_000_000n;

const transferEvent = new ABIEvent(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

type RawTransferLog = {
  data?: string;
  topics?: string[];
  meta?: {
    blockNumber?: number;
    blockTimestamp?: number;
    txID?: string;
    txOrigin?: string;
    clauseIndex?: number;
  };
};

export type Vot3ConversionEvent = {
  txId: string;
  blockNumber: number;
  blockTimestamp: number;
  clauseIndex: number;
  amountWei: string;
};

export type Vot3ConversionProgress = {
  converted: boolean;
  qualifyingConversion:
    | Vot3ConversionEvent
    | null;
  matchedConversionEvents:
    Vot3ConversionEvent[];
  belowMinimumEvents:
    Vot3ConversionEvent[];
  beforeFirstDappEvents:
    Vot3ConversionEvent[];
  latestBlock: number;
  minimumAmountWei: string;
};

function getSingleTopic(
  topic:
    | `0x${string}`
    | `0x${string}`[]
    | null
    | undefined,
): string | undefined {
  return typeof topic === 'string'
    ? topic
    : undefined;
}

function isValidAddress(
  value: string,
): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(
    value,
  );
}

function parseRequiredInteger(
  value: number | undefined,
  fieldName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `VOT3 conversion event is missing a valid ${fieldName}.`,
    );
  }

  return value;
}

function parseRequiredTxId(
  value: string | undefined,
): string {
  const normalized =
    value?.toLowerCase();

  if (
    !normalized ||
    !/^0x[0-9a-f]{64}$/.test(
      normalized,
    )
  ) {
    throw new Error(
      'VOT3 conversion event is missing a valid transaction ID.',
    );
  }

  return normalized;
}

function parseAmountWei(
  data: string | undefined,
): bigint {
  if (
    !data ||
    !/^0x[0-9a-fA-F]{64}$/.test(
      data,
    )
  ) {
    throw new Error(
      'VOT3 conversion event contains an invalid ERC-20 amount.',
    );
  }

  return BigInt(data);
}

function normalizeTransferLog(
  log: RawTransferLog,
): Vot3ConversionEvent {
  return {
    txId:
      parseRequiredTxId(
        log.meta?.txID,
      ),
    blockNumber:
      parseRequiredInteger(
        log.meta?.blockNumber,
        'block number',
      ),
    blockTimestamp:
      parseRequiredInteger(
        log.meta?.blockTimestamp,
        'block timestamp',
      ),
    clauseIndex:
      parseRequiredInteger(
        log.meta?.clauseIndex,
        'clause index',
      ),
    amountWei:
      parseAmountWei(
        log.data,
      ).toString(),
  };
}

function eventMatchKey(
  event: Vot3ConversionEvent,
): string {
  return [
    event.txId,
    event.clauseIndex,
    event.amountWei,
  ].join(':');
}

function sortEvents(
  events: Vot3ConversionEvent[],
) {
  return [...events].sort(
    (left, right) =>
      left.blockNumber -
        right.blockNumber ||
      left.clauseIndex -
        right.clauseIndex ||
      left.txId.localeCompare(
        right.txId,
      ),
  );
}

/**
 * Verifies a real B3TR -> VOT3 conversion by requiring both sides of the
 * official conversion transaction:
 *
 * 1. B3TR Transfer(user -> VOT3 contract, amount)
 * 2. VOT3 Transfer(0x0 -> user, same amount)
 *
 * Both events must share the same transaction and clause. Receiving VOT3 from
 * another wallet therefore cannot satisfy this mission.
 *
 * VeInvite's current policy accepts the first matched conversion of at least
 * 1 B3TR that occurs after the invitation is active AND no earlier than the
 * first qualifying dApp reward. The other two dApp rewards may happen before
 * or after the conversion/vote sequence.
 */
export async function getVeBetterVot3ConversionProgress({
  walletAddress,
  activationBlock,
  firstQualifyingRewardBlock,
}: {
  walletAddress: string;
  activationBlock: number;
  firstQualifyingRewardBlock: number;
}): Promise<Vot3ConversionProgress> {
  if (!isValidAddress(walletAddress)) {
    throw new Error(
      'Invalid VOT3 conversion wallet address.',
    );
  }

  if (
    !Number.isSafeInteger(
      activationBlock,
    ) ||
    activationBlock < 0
  ) {
    throw new Error(
      'Invalid VOT3 conversion activation block.',
    );
  }

  if (
    !Number.isSafeInteger(
      firstQualifyingRewardBlock,
    ) ||
    firstQualifyingRewardBlock <
      activationBlock
  ) {
    throw new Error(
      'Invalid first dApp reward block for VOT3 conversion.',
    );
  }

  const {
    nodeUrl,
    b3trAddress,
    vot3Address,
  } = getVeBetterNetworkConfig();

  const thor =
    ThorClient.at(nodeUrl);

  const bestBlock =
    await thor.blocks
      .getBestBlockCompressed();

  if (!bestBlock) {
    throw new Error(
      'Unable to load the latest VeChain block for VOT3 conversion verification.',
    );
  }

  const latestBlock =
    bestBlock.number;

  if (activationBlock > latestBlock) {
    return {
      converted: false,
      qualifyingConversion: null,
      matchedConversionEvents: [],
      belowMinimumEvents: [],
      beforeFirstDappEvents: [],
      latestBlock,
      minimumAmountWei:
        MIN_VOT3_CONVERSION_WEI
          .toString(),
    };
  }

  const loadLogs = async ({
    address,
    topics,
  }: {
    address: string;
    topics: ReturnType<
      typeof transferEvent.encodeFilterTopics
    >;
  }) => {
    const collected:
      RawTransferLog[] = [];
    let offset = 0;

    while (true) {
      const logs =
        await thor.logs
          .filterRawEventLogs({
            range: {
              unit: 'block',
              from: activationBlock,
              to: latestBlock,
            },
            options: {
              offset,
              limit: PAGE_SIZE,
            },
            criteriaSet: [
              {
                address,
                topic0:
                  getSingleTopic(
                    topics[0],
                  ),
                topic1:
                  getSingleTopic(
                    topics[1],
                  ),
                topic2:
                  getSingleTopic(
                    topics[2],
                  ),
                topic3:
                  getSingleTopic(
                    topics[3],
                  ),
              },
            ],
            order: 'asc',
          });

      const rawLogs =
        logs as RawTransferLog[];

      collected.push(
        ...rawLogs,
      );

      if (
        rawLogs.length < PAGE_SIZE
      ) {
        break;
      }

      offset += PAGE_SIZE;
    }

    return collected;
  };

  const vot3MintTopics =
    transferEvent.encodeFilterTopics([
      ZERO_ADDRESS,
      walletAddress,
      null,
    ]);

  const b3trDebitTopics =
    transferEvent.encodeFilterTopics([
      walletAddress,
      vot3Address,
      null,
    ]);

  const [
    vot3MintLogs,
    b3trDebitLogs,
  ] = await Promise.all([
    loadLogs({
      address: vot3Address,
      topics: vot3MintTopics,
    }),
    loadLogs({
      address: b3trAddress,
      topics: b3trDebitTopics,
    }),
  ]);

  const b3trDebitKeys =
    new Set(
      b3trDebitLogs.map(
        (log) =>
          eventMatchKey(
            normalizeTransferLog(
              log,
            ),
          ),
      ),
    );

  const matched =
    sortEvents(
      vot3MintLogs
        .map(
          normalizeTransferLog,
        )
        .filter(
          (event) =>
            b3trDebitKeys.has(
              eventMatchKey(
                event,
              ),
            ),
        ),
    );

  const qualifyingConversion =
    matched.find(
      (event) =>
        event.blockNumber >=
          firstQualifyingRewardBlock &&
        BigInt(event.amountWei) >=
          MIN_VOT3_CONVERSION_WEI,
    ) ?? null;

  const belowMinimumEvents =
    matched.filter(
      (event) =>
        event.blockNumber >=
          firstQualifyingRewardBlock &&
        BigInt(event.amountWei) <
          MIN_VOT3_CONVERSION_WEI,
    );

  const beforeFirstDappEvents =
    matched.filter(
      (event) =>
        event.blockNumber <
          firstQualifyingRewardBlock,
    );

  return {
    converted:
      qualifyingConversion !== null,
    qualifyingConversion,
    matchedConversionEvents:
      matched,
    belowMinimumEvents,
    beforeFirstDappEvents,
    latestBlock,
    minimumAmountWei:
      MIN_VOT3_CONVERSION_WEI
        .toString(),
  };
}
