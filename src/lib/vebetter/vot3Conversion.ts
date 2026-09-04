import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  compareChainEventPosition,
  createTransactionIndexResolver,
  isStrictlyAfter,
  type ChainEventPosition,
} from '@/lib/vebetter/eventOrder';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const PAGE_SIZE = 1000;
const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000';

// One token wei means any real, positive B3TR -> VOT3 conversion qualifies.
// VeBetterDAO itself enforces the separate voting-power threshold when the
// invitee later casts the required allocation-round vote.
export const MIN_VOT3_CONVERSION_WEI = 1n;

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

export type Vot3ConversionEvent =
  ChainEventPosition & {
    blockTimestamp: number;
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
  checkedBlock: number;
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

function validateKnownPosition(
  position: ChainEventPosition,
  activationBlock: number,
): ChainEventPosition {
  const txId = position.txId.toLowerCase();

  if (!/^0x[0-9a-f]{64}$/.test(txId)) {
    throw new Error(
      'First qualifying dApp reward has an invalid transaction ID.',
    );
  }

  for (const [label, value] of [
    ['block number', position.blockNumber],
    ['transaction index', position.txIndex],
    ['clause index', position.clauseIndex],
  ] as const) {
    if (
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new Error(
        `First qualifying dApp reward has an invalid ${label}.`,
      );
    }
  }

  if (position.blockNumber < activationBlock) {
    throw new Error(
      'First qualifying dApp reward predates invitation activation.',
    );
  }

  return {
    txId,
    blockNumber: position.blockNumber,
    txIndex: position.txIndex,
    clauseIndex: position.clauseIndex,
  };
}

type ParsedTransferEvent = Omit<
  Vot3ConversionEvent,
  'txIndex'
>;

function normalizeTransferLog(
  log: RawTransferLog,
): ParsedTransferEvent {
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
  event: ParsedTransferEvent,
): string {
  return [
    event.txId,
    event.clauseIndex,
    event.amountWei,
  ].join(':');
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
 * A qualifying conversion may be any positive amount, but it must happen
 * strictly after the exact first positive dApp reward already verified by the
 * activity scanner in VeChain execution order (block -> transaction -> clause).
 * Passing the exact event position avoids re-discovering a different same-block
 * reward. VeBetterDAO separately enforces its own voting-power threshold when
 * the invitee later casts the allocation-round vote.
 */
export async function getVeBetterVot3ConversionProgress({
  walletAddress,
  activationBlock,
  firstQualifyingReward,
  checkedBlock,
}: {
  walletAddress: string;
  activationBlock: number;
  firstQualifyingReward: ChainEventPosition;
  checkedBlock?: number;
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

  const firstRewardPosition =
    validateKnownPosition(
      firstQualifyingReward,
      activationBlock,
    );

  if (
    checkedBlock !== undefined &&
    (
      !Number.isSafeInteger(
        checkedBlock,
      ) ||
      checkedBlock < activationBlock
    )
  ) {
    throw new Error(
      'Invalid sealed block for VOT3 conversion verification.',
    );
  }

  const {
    nodeUrl,
    b3trAddress,
    vot3Address,
  } = getVeBetterNetworkConfig();

  const thor =
    ThorClient.at(nodeUrl);
  const resolveTxIndex =
    createTransactionIndexResolver(thor);

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
  const scanEndBlock =
    checkedBlock === undefined
      ? latestBlock
      : Math.min(
          checkedBlock,
          latestBlock,
        );

  if (
    activationBlock > scanEndBlock ||
    firstRewardPosition.blockNumber > scanEndBlock
  ) {
    return {
      converted: false,
      qualifyingConversion: null,
      matchedConversionEvents: [],
      belowMinimumEvents: [],
      beforeFirstDappEvents: [],
      latestBlock,
      checkedBlock: scanEndBlock,
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
              to: scanEndBlock,
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
            normalizeTransferLog(log),
          ),
      ),
    );

  const matchedWithoutTxIndex =
    vot3MintLogs
      .map(normalizeTransferLog)
      .filter(
        (event) =>
          b3trDebitKeys.has(
            eventMatchKey(event),
          ),
      );

  const matched =
    await Promise.all(
      matchedWithoutTxIndex.map(
        async (event): Promise<Vot3ConversionEvent> => ({
          ...event,
          txIndex: await resolveTxIndex(
            event.blockNumber,
            event.txId,
          ),
        }),
      ),
    );

  matched.sort(compareChainEventPosition);

  const afterFirstDapp = matched.filter(
    (event) =>
      isStrictlyAfter(
        event,
        firstRewardPosition,
      ),
  );

  const qualifyingConversion =
    afterFirstDapp.find(
      (event) =>
        BigInt(event.amountWei) >=
          MIN_VOT3_CONVERSION_WEI,
    ) ?? null;

  const belowMinimumEvents =
    afterFirstDapp.filter(
      (event) =>
        BigInt(event.amountWei) <
          MIN_VOT3_CONVERSION_WEI,
    );

  const beforeFirstDappEvents =
    matched.filter(
      (event) =>
        !isStrictlyAfter(
          event,
          firstRewardPosition,
        ),
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
    checkedBlock: scanEndBlock,
    minimumAmountWei:
      MIN_VOT3_CONVERSION_WEI
        .toString(),
  };
}
