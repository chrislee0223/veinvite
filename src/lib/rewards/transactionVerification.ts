import { Interface } from 'ethers';
import { ThorClient } from '@vechain/sdk-network';

import {
  type PayoutManifest,
  type PayoutManifestClause,
} from '@/lib/rewards/payoutManifest';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;
const HEX_DATA_PATTERN = /^0x[0-9a-f]*$/;

const rewardDistributedInterface = new Interface([
  'event RewardDistributed(uint256 amount,bytes32 indexed appId,address indexed receiver,string proof,address indexed distributor)',
]);

const rewardDistributedEvent =
  rewardDistributedInterface.getEvent('RewardDistributed');

if (!rewardDistributedEvent) {
  throw new Error(
    'RewardDistributed ABI is unavailable.',
  );
}

const REWARD_DISTRIBUTED_TOPIC =
  rewardDistributedEvent.topicHash.toLowerCase();

export type RewardTxVerificationCode =
  | 'TX_NOT_FOUND'
  | 'TX_RECEIPT_NOT_FOUND'
  | 'TX_NOT_FINALIZED'
  | 'TX_REVERTED'
  | 'TX_CHAIN_MISMATCH'
  | 'TX_MANIFEST_MISMATCH'
  | 'TX_EVENT_MISMATCH'
  | 'TX_OPERATOR_MISMATCH'
  | 'TX_PREDATES_MANIFEST';

export class RewardTransactionVerificationError
  extends Error {
  code: RewardTxVerificationCode;

  constructor(
    code: RewardTxVerificationCode,
    message: string,
  ) {
    super(message);
    this.name =
      'RewardTransactionVerificationError';
    this.code = code;
  }
}

export type NormalizedRewardTxEvent = {
  address: string;
  topics: string[];
  data: string;
};

export type NormalizedRewardTxOutput = {
  events: NormalizedRewardTxEvent[];
};

export type FinalizedRewardTransactionEvidence = {
  txId: string;
  txOrigin: string;
  blockId: string;
  blockNumber: number;
  blockTimestamp: number;
  finalizedHeadId: string;
  finalizedHeadNumber: number;
  clauses: Array<{
    to: string;
    value: string;
    data: string;
  }>;
  outputs: NormalizedRewardTxOutput[];
  reverted: boolean;
};

export type VerifiedRewardTransaction = {
  txId: string;
  txOrigin: string;
  blockId: string;
  blockNumber: number;
  blockTimestamp: number;
  finalizedHeadId: string;
  finalizedHeadNumber: number;
  clauseCount: number;
  payoutCount: number;
  totalAmountWei: string;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeAddress(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (!ADDRESS_PATTERN.test(normalized)) {
    throw new Error(
      `${fieldName} is not a valid VeChain address.`,
    );
  }

  return normalized;
}

function normalizeHex32(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (!HEX_32_PATTERN.test(normalized)) {
    throw new Error(
      `${fieldName} is not a valid 32-byte hex value.`,
    );
  }

  return normalized;
}

function normalizeHexData(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (!HEX_DATA_PATTERN.test(normalized)) {
    throw new Error(
      `${fieldName} is not valid hex data.`,
    );
  }

  return normalized;
}

function normalizeSafeInteger(
  value: unknown,
  fieldName: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error(
      `${fieldName} is not a valid non-negative integer.`,
    );
  }

  return parsed;
}

function normalizeValue(
  value: unknown,
  fieldName: string,
): string {
  try {
    const parsed = BigInt(String(value));

    if (parsed < 0n) {
      throw new Error('negative');
    }

    return parsed.toString();
  } catch {
    throw new Error(
      `${fieldName} is not a valid integer value.`,
    );
  }
}

function normalizeEvent(
  value: unknown,
): NormalizedRewardTxEvent {
  if (!isRecord(value)) {
    throw new Error(
      'Transaction receipt contains an invalid event.',
    );
  }

  if (!Array.isArray(value.topics)) {
    throw new Error(
      'Transaction receipt event topics are invalid.',
    );
  }

  return {
    address: normalizeAddress(
      value.address,
      'receipt event address',
    ),
    topics: value.topics.map((topic) =>
      normalizeHexData(
        topic,
        'receipt event topic',
      ),
    ),
    data: normalizeHexData(
      value.data,
      'receipt event data',
    ),
  };
}

function normalizeOutput(
  value: unknown,
): NormalizedRewardTxOutput {
  if (!isRecord(value)) {
    throw new Error(
      'Transaction receipt contains an invalid output.',
    );
  }

  const events = value.events;

  if (!Array.isArray(events)) {
    throw new Error(
      'Transaction receipt output events are invalid.',
    );
  }

  return {
    events: events.map(normalizeEvent),
  };
}

function normalizeClause(
  value: unknown,
  index: number,
) {
  if (!isRecord(value)) {
    throw new Error(
      `Transaction clause ${index} is invalid.`,
    );
  }

  return {
    to: normalizeAddress(
      value.to,
      `transaction clause ${index} destination`,
    ),
    value: normalizeValue(
      value.value,
      `transaction clause ${index} value`,
    ),
    data: normalizeHexData(
      value.data,
      `transaction clause ${index} data`,
    ),
  };
}

function normalizeTransaction(
  raw: unknown,
) {
  if (!isRecord(raw)) {
    throw new Error(
      'VeChain transaction response is invalid.',
    );
  }

  if (!Array.isArray(raw.clauses)) {
    throw new Error(
      'VeChain transaction clauses are invalid.',
    );
  }

  const meta = isRecord(raw.meta)
    ? raw.meta
    : null;

  return {
    id: normalizeHex32(
      raw.id ?? meta?.txID,
      'transaction id',
    ),
    origin: normalizeAddress(
      raw.origin ?? meta?.txOrigin,
      'transaction origin',
    ),
    clauses: raw.clauses.map(normalizeClause),
  };
}

function normalizeReceipt(
  raw: unknown,
) {
  if (!isRecord(raw)) {
    throw new Error(
      'VeChain transaction receipt response is invalid.',
    );
  }

  const meta = raw.meta;

  if (!isRecord(meta)) {
    throw new Error(
      'VeChain transaction receipt metadata is invalid.',
    );
  }

  if (!Array.isArray(raw.outputs)) {
    throw new Error(
      'VeChain transaction receipt outputs are invalid.',
    );
  }

  if (typeof raw.reverted !== 'boolean') {
    throw new Error(
      'VeChain transaction receipt reverted flag is invalid.',
    );
  }

  return {
    txId: normalizeHex32(
      meta.txID,
      'receipt transaction id',
    ),
    txOrigin: normalizeAddress(
      meta.txOrigin,
      'receipt transaction origin',
    ),
    blockId: normalizeHex32(
      meta.blockID,
      'receipt block id',
    ),
    blockNumber: normalizeSafeInteger(
      meta.blockNumber,
      'receipt block number',
    ),
    blockTimestamp: normalizeSafeInteger(
      meta.blockTimestamp,
      'receipt block timestamp',
    ),
    reverted: raw.reverted,
    outputs: raw.outputs.map(normalizeOutput),
  };
}

function normalizeBlock(
  raw: unknown,
  fieldName: string,
) {
  if (!isRecord(raw)) {
    throw new Error(
      `${fieldName} response is invalid.`,
    );
  }

  return {
    id: normalizeHex32(
      raw.id,
      `${fieldName} id`,
    ),
    number: normalizeSafeInteger(
      raw.number,
      `${fieldName} number`,
    ),
    timestamp: normalizeSafeInteger(
      raw.timestamp,
      `${fieldName} timestamp`,
    ),
    isTrunk:
      typeof raw.isTrunk === 'boolean'
        ? raw.isTrunk
        : true,
  };
}

function isNotFoundError(
  error: unknown,
): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    message.includes('404') ||
    message.includes('not found')
  );
}

async function readNullable<T>(
  reader: () => Promise<T>,
): Promise<T | null> {
  try {
    return await reader();
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function compareManifestClause(
  expected: PayoutManifestClause,
  actual: FinalizedRewardTransactionEvidence['clauses'][number],
  index: number,
) {
  if (
    actual.to !== expected.to.toLowerCase() ||
    actual.data !== expected.data.toLowerCase() ||
    BigInt(actual.value) !== 0n
  ) {
    throw new RewardTransactionVerificationError(
      'TX_MANIFEST_MISMATCH',
      `Transaction clause ${index} does not exactly match the immutable payout manifest.`,
    );
  }
}

function parseRewardDistributedEvent(
  event: NormalizedRewardTxEvent,
) {
  if (
    event.topics[0]?.toLowerCase() !==
      REWARD_DISTRIBUTED_TOPIC
  ) {
    return null;
  }

  try {
    const parsed =
      rewardDistributedInterface.parseLog({
        topics: event.topics,
        data: event.data,
      });

    if (
      !parsed ||
      parsed.name !== 'RewardDistributed'
    ) {
      return null;
    }

    return {
      amountWei:
        BigInt(parsed.args[0]).toString(),
      appId:
        String(parsed.args[1]).toLowerCase(),
      receiver:
        String(parsed.args[2]).toLowerCase(),
      proof: String(parsed.args[3]),
      distributor:
        String(parsed.args[4]).toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function verifyPayoutTransactionEvidence({
  manifest,
  operatorWallet,
  manifestCreatedAt,
  evidence,
}: {
  manifest: PayoutManifest;
  operatorWallet: string;
  manifestCreatedAt: string | Date;
  evidence: FinalizedRewardTransactionEvidence;
}): VerifiedRewardTransaction {
  const normalizedOperator =
    normalizeAddress(
      operatorWallet,
      'manifest operator wallet',
    );

  if (evidence.reverted) {
    throw new RewardTransactionVerificationError(
      'TX_REVERTED',
      'The payout transaction reverted on-chain.',
    );
  }

  if (
    evidence.txOrigin !== normalizedOperator
  ) {
    throw new RewardTransactionVerificationError(
      'TX_OPERATOR_MISMATCH',
      'The payout transaction origin does not match the manifest operator wallet.',
    );
  }

  if (
    evidence.blockNumber >
      evidence.finalizedHeadNumber
  ) {
    throw new RewardTransactionVerificationError(
      'TX_NOT_FINALIZED',
      'The payout transaction is not finalized yet.',
    );
  }

  const createdAt =
    manifestCreatedAt instanceof Date
      ? manifestCreatedAt
      : new Date(manifestCreatedAt);

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(
      'Payout manifest created_at is invalid.',
    );
  }

  const createdAtSeconds =
    Math.floor(createdAt.getTime() / 1000);

  if (
    evidence.blockTimestamp <
      createdAtSeconds - 60
  ) {
    throw new RewardTransactionVerificationError(
      'TX_PREDATES_MANIFEST',
      'The payout transaction predates the immutable payout manifest.',
    );
  }

  if (
    evidence.clauses.length !==
      manifest.payoutCount ||
    evidence.outputs.length !==
      manifest.payoutCount ||
    manifest.clauses.length !==
      manifest.payoutCount
  ) {
    throw new RewardTransactionVerificationError(
      'TX_MANIFEST_MISMATCH',
      'The transaction clause/output count does not match the payout manifest.',
    );
  }

  let eventTotal = 0n;

  manifest.clauses.forEach(
    (expectedClause, index) => {
      const actualClause =
        evidence.clauses[index];
      const output = evidence.outputs[index];

      if (!actualClause || !output) {
        throw new RewardTransactionVerificationError(
          'TX_MANIFEST_MISMATCH',
          `Transaction clause ${index} is missing.`,
        );
      }

      compareManifestClause(
        expectedClause,
        actualClause,
        index,
      );

      const rewardEvents =
        output.events
          .filter(
            (event) =>
              event.address ===
                manifest.x2EarnRewardsPoolAddress
                  .toLowerCase(),
          )
          .map(parseRewardDistributedEvent)
          .filter(
            (
              event,
            ): event is NonNullable<
              ReturnType<
                typeof parseRewardDistributedEvent
              >
            > => event !== null,
          );

      if (rewardEvents.length !== 1) {
        throw new RewardTransactionVerificationError(
          'TX_EVENT_MISMATCH',
          `Transaction clause ${index} did not emit exactly one RewardDistributed event from the reviewed rewards pool.`,
        );
      }

      const rewardEvent = rewardEvents[0];

      if (!rewardEvent) {
        throw new RewardTransactionVerificationError(
          'TX_EVENT_MISMATCH',
          `Transaction clause ${index} reward event is missing.`,
        );
      }

      if (
        rewardEvent.appId !==
          manifest.appId.toLowerCase() ||
        rewardEvent.receiver !==
          expectedClause.recipientWallet
            .toLowerCase() ||
        rewardEvent.amountWei !==
          expectedClause.amountWei ||
        rewardEvent.proof !== '' ||
        rewardEvent.distributor !==
          normalizedOperator
      ) {
        throw new RewardTransactionVerificationError(
          'TX_EVENT_MISMATCH',
          `Transaction clause ${index} RewardDistributed event does not match the immutable payout manifest.`,
        );
      }

      eventTotal +=
        BigInt(rewardEvent.amountWei);
    },
  );

  if (
    eventTotal.toString() !==
      manifest.totalAmountWei
  ) {
    throw new RewardTransactionVerificationError(
      'TX_EVENT_MISMATCH',
      'RewardDistributed event total does not match the payout manifest total.',
    );
  }

  return {
    txId: evidence.txId,
    txOrigin: evidence.txOrigin,
    blockId: evidence.blockId,
    blockNumber: evidence.blockNumber,
    blockTimestamp:
      evidence.blockTimestamp,
    finalizedHeadId:
      evidence.finalizedHeadId,
    finalizedHeadNumber:
      evidence.finalizedHeadNumber,
    clauseCount: evidence.clauses.length,
    payoutCount: manifest.payoutCount,
    totalAmountWei:
      manifest.totalAmountWei,
  };
}

export async function loadFinalizedRewardTransactionEvidence(
  rawTxId: string,
): Promise<FinalizedRewardTransactionEvidence> {
  const txId = normalizeHex32(
    rawTxId,
    'payout transaction id',
  );
  const { nodeUrl } =
    getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);

  const [
    rawTransaction,
    rawReceipt,
    rawFinalizedHead,
  ] = await Promise.all([
    readNullable(() =>
      thor.transactions.getTransaction(txId),
    ),
    readNullable(() =>
      thor.transactions.getTransactionReceipt(
        txId,
      ),
    ),
    thor.blocks.getBlockCompressed(
      'finalized',
    ),
  ]);

  if (!rawTransaction) {
    throw new RewardTransactionVerificationError(
      'TX_NOT_FOUND',
      'The payout transaction was not found on VeChain.',
    );
  }

  if (!rawReceipt) {
    throw new RewardTransactionVerificationError(
      'TX_RECEIPT_NOT_FOUND',
      'The payout transaction receipt is not available yet.',
    );
  }

  if (!rawFinalizedHead) {
    throw new Error(
      'VeChain finalized head could not be loaded.',
    );
  }

  const transaction =
    normalizeTransaction(rawTransaction);
  const receipt =
    normalizeReceipt(rawReceipt);
  const finalizedHead =
    normalizeBlock(
      rawFinalizedHead,
      'finalized block',
    );

  if (
    transaction.id !== txId ||
    receipt.txId !== txId
  ) {
    throw new RewardTransactionVerificationError(
      'TX_CHAIN_MISMATCH',
      'VeChain transaction identifiers do not match the requested tx id.',
    );
  }

  if (
    transaction.origin !==
      receipt.txOrigin
  ) {
    throw new RewardTransactionVerificationError(
      'TX_CHAIN_MISMATCH',
      'VeChain transaction origin does not match receipt origin.',
    );
  }

  if (
    receipt.blockNumber >
      finalizedHead.number
  ) {
    throw new RewardTransactionVerificationError(
      'TX_NOT_FINALIZED',
      'The payout transaction is confirmed but not finalized yet.',
    );
  }

  const rawCanonicalBlock =
    await thor.blocks.getBlockCompressed(
      receipt.blockNumber,
    );

  if (!rawCanonicalBlock) {
    throw new Error(
      'The payout transaction block could not be loaded.',
    );
  }

  const canonicalBlock =
    normalizeBlock(
      rawCanonicalBlock,
      'transaction block',
    );

  if (
    !canonicalBlock.isTrunk ||
    canonicalBlock.id !== receipt.blockId ||
    canonicalBlock.timestamp !==
      receipt.blockTimestamp
  ) {
    throw new RewardTransactionVerificationError(
      'TX_CHAIN_MISMATCH',
      'The payout transaction receipt does not match the finalized canonical block.',
    );
  }

  return {
    txId,
    txOrigin: receipt.txOrigin,
    blockId: receipt.blockId,
    blockNumber: receipt.blockNumber,
    blockTimestamp:
      receipt.blockTimestamp,
    finalizedHeadId:
      finalizedHead.id,
    finalizedHeadNumber:
      finalizedHead.number,
    clauses: transaction.clauses,
    outputs: receipt.outputs,
    reverted: receipt.reverted,
  };
}

export async function verifyFinalizedRewardTransactionOnChain({
  txId,
  manifest,
  operatorWallet,
  manifestCreatedAt,
}: {
  txId: string;
  manifest: PayoutManifest;
  operatorWallet: string;
  manifestCreatedAt: string | Date;
}): Promise<VerifiedRewardTransaction> {
  const evidence =
    await loadFinalizedRewardTransactionEvidence(
      txId,
    );

  return verifyPayoutTransactionEvidence({
    manifest,
    operatorWallet,
    manifestCreatedAt,
    evidence,
  });
}
