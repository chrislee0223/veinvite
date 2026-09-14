import { Interface } from 'ethers';

import {
  PAYOUT_MANIFEST_VERSION_V2,
  PAYOUT_MANIFEST_VERSION_V3,
  type PayoutManifest,
  type PayoutManifestClause,
} from '@/lib/rewards/payoutManifest';
import {
  RewardTransactionVerificationError,
  loadFinalizedRewardTransactionEvidence,
  verifyPayoutTransactionEvidence as verifyLegacyPayoutTransactionEvidence,
  type FinalizedRewardTransactionEvidence,
  type VerifiedRewardTransaction,
} from '@/lib/rewards/transactionVerificationLegacy';

export {
  RewardTransactionVerificationError,
  loadFinalizedRewardTransactionEvidence,
} from '@/lib/rewards/transactionVerificationLegacy';
export type {
  RewardTxVerificationCode,
  NormalizedRewardTxEvent,
  NormalizedRewardTxOutput,
  FinalizedRewardTransactionEvidence,
  VerifiedRewardTransaction,
} from '@/lib/rewards/transactionVerificationLegacy';

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

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function assertStructuredProofMatchesClause(
  rawProof: string,
  clause: PayoutManifestClause,
  index: number,
) {
  if (
    clause.proofTypes?.length !== 2 ||
    clause.proofTypes[0] !== 'text' ||
    clause.proofTypes[1] !== 'link' ||
    clause.proofValues?.length !== 2 ||
    clause.proofValues[0] !== clause.proof ||
    !clause.proofValues[1] ||
    clause.impactCodes?.length !== 0 ||
    clause.impactValues?.length !== 0 ||
    !clause.description
  ) {
    throw new RewardTransactionVerificationError(
      'TX_MANIFEST_MISMATCH',
      `Transaction clause ${index} has invalid structured proof metadata.`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawProof);
  } catch {
    throw new RewardTransactionVerificationError(
      'TX_EVENT_MISMATCH',
      `Transaction clause ${index} emitted invalid structured reward proof JSON.`,
    );
  }

  if (!isRecord(parsed)) {
    throw new RewardTransactionVerificationError(
      'TX_EVENT_MISMATCH',
      `Transaction clause ${index} emitted malformed structured reward proof.`,
    );
  }

  const proof = parsed.proof;
  const impact = parsed.impact;

  if (
    parsed.version !== 2 ||
    parsed.description !== clause.description ||
    !isRecord(proof) ||
    proof.text !== clause.proofValues[0] ||
    proof.link !== clause.proofValues[1] ||
    !isRecord(impact) ||
    Object.keys(impact).length !== 0
  ) {
    throw new RewardTransactionVerificationError(
      'TX_EVENT_MISMATCH',
      `Transaction clause ${index} structured RewardDistributed proof does not match the immutable payout manifest.`,
    );
  }
}

function sanitizeStructuredProofsForLegacyVerifier({
  manifest,
  evidence,
}: {
  manifest: PayoutManifest;
  evidence: FinalizedRewardTransactionEvidence;
}): FinalizedRewardTransactionEvidence {
  const poolAddress =
    manifest.x2EarnRewardsPoolAddress.toLowerCase();

  const outputs = evidence.outputs.map(
    (output, index) => {
      const clause = manifest.clauses[index];

      if (!clause) {
        return output;
      }

      const matchingIndexes = output.events
        .map((event, eventIndex) => ({
          event,
          eventIndex,
        }))
        .filter(
          ({ event }) =>
            event.address.toLowerCase() === poolAddress &&
            event.topics[0]?.toLowerCase() ===
              REWARD_DISTRIBUTED_TOPIC,
        );

      if (matchingIndexes.length !== 1) {
        throw new RewardTransactionVerificationError(
          'TX_EVENT_MISMATCH',
          `Transaction clause ${index} did not emit exactly one RewardDistributed event from the reviewed rewards pool.`,
        );
      }

      const match = matchingIndexes[0];

      if (!match) {
        throw new RewardTransactionVerificationError(
          'TX_EVENT_MISMATCH',
          `Transaction clause ${index} reward event is missing.`,
        );
      }

      let parsed;

      try {
        parsed = rewardDistributedInterface.parseLog({
          topics: match.event.topics,
          data: match.event.data,
        });
      } catch {
        parsed = null;
      }

      if (
        !parsed ||
        parsed.name !== 'RewardDistributed'
      ) {
        throw new RewardTransactionVerificationError(
          'TX_EVENT_MISMATCH',
          `Transaction clause ${index} RewardDistributed event could not be decoded.`,
        );
      }

      assertStructuredProofMatchesClause(
        String(parsed.args[3]),
        clause,
        index,
      );

      const sanitized =
        rewardDistributedInterface.encodeEventLog(
          'RewardDistributed',
          [
            parsed.args[0],
            parsed.args[1],
            parsed.args[2],
            '',
            parsed.args[4],
          ],
        );

      return {
        events: output.events.map(
          (event, eventIndex) =>
            eventIndex === match.eventIndex
              ? {
                  ...event,
                  topics: sanitized.topics.map(
                    (topic) => topic.toLowerCase(),
                  ),
                  data: sanitized.data.toLowerCase(),
                }
              : event,
        ),
      };
    },
  );

  return {
    ...evidence,
    outputs,
  };
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
  if (manifest.version === PAYOUT_MANIFEST_VERSION_V2) {
    return verifyLegacyPayoutTransactionEvidence({
      manifest,
      operatorWallet,
      manifestCreatedAt,
      evidence,
    });
  }

  if (manifest.version !== PAYOUT_MANIFEST_VERSION_V3) {
    throw new RewardTransactionVerificationError(
      'TX_MANIFEST_MISMATCH',
      'Unsupported reward payout manifest version.',
    );
  }

  const sanitizedEvidence =
    sanitizeStructuredProofsForLegacyVerifier({
      manifest,
      evidence,
    });

  return verifyLegacyPayoutTransactionEvidence({
    manifest,
    operatorWallet,
    manifestCreatedAt,
    evidence: sanitizedEvidence,
  });
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
