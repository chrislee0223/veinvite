import 'server-only';

import { randomUUID } from 'node:crypto';
import { ThorClient } from '@vechain/sdk-network';

import {
  buildPayoutManifest,
  type RewardPayoutForManifest,
  type RewardRoundForManifest,
} from '@/lib/rewards/payoutManifest';
import {
  RewardTransactionVerificationError,
  verifyFinalizedRewardTransactionOnChain,
} from '@/lib/rewards/transactionVerification';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

const RECOVERY_LOCK_SECONDS = 180;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;

export type SubmittedPayoutRecoveryStatus =
  | 'IDLE'
  | 'LOCKED'
  | 'WAITING_FINALITY'
  | 'PAID'
  | 'MANUAL_INTERVENTION_REQUIRED';

export type SubmittedPayoutRecoveryResult = {
  status: SubmittedPayoutRecoveryStatus;
  roundId: string | null;
  manifestId: string | null;
  txId: string | null;
  reason?: string;
};

function normalizeAddress(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ADDRESS_PATTERN.test(normalized) ? normalized : null;
}

function positiveId(value: unknown, fieldName: string): string {
  const normalized = String(value ?? '');
  if (!/^\d+$/.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return BigInt(normalized).toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function observeCanonicalSuccessfulReceipt({
  txId,
  expectedOperator,
}: {
  txId: string;
  expectedOperator: string;
}): Promise<boolean> {
  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const [rawTransaction, rawReceipt] = await Promise.all([
    thor.transactions.getTransaction(txId),
    thor.transactions.getTransactionReceipt(txId),
  ]);

  if (!rawTransaction || !rawReceipt) {
    return false;
  }

  const transaction = rawTransaction as unknown as Record<string, unknown>;
  const receipt = rawReceipt as unknown as Record<string, unknown>;
  const meta = isRecord(receipt.meta) ? receipt.meta : null;

  if (!meta) {
    throw new Error(
      'Submitted payout receipt metadata is unavailable before broadcast confirmation.',
    );
  }

  if (receipt.reverted !== false) {
    throw new Error(
      'Submitted payout transaction reverted and cannot release the next reward batch.',
    );
  }

  const observedTxId = String(
    transaction.id ??
      (isRecord(transaction.meta) ? transaction.meta.txID : '') ?? '',
  ).toLowerCase();
  const receiptTxId = String(meta.txID ?? '').toLowerCase();
  const transactionOrigin = normalizeAddress(
    transaction.origin ??
      (isRecord(transaction.meta) ? transaction.meta.txOrigin : null),
  );
  const receiptOrigin = normalizeAddress(meta.txOrigin);

  if (
    observedTxId !== txId ||
    receiptTxId !== txId ||
    transactionOrigin !== expectedOperator ||
    receiptOrigin !== expectedOperator
  ) {
    throw new Error(
      'Submitted payout transaction or receipt identity does not match the immutable journal.',
    );
  }

  const blockNumber = Number(meta.blockNumber);
  const blockId = String(meta.blockID ?? '').toLowerCase();

  if (
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0 ||
    !HEX_32_PATTERN.test(blockId)
  ) {
    throw new Error(
      'Submitted payout receipt block metadata is invalid.',
    );
  }

  const canonicalBlock =
    await thor.blocks.getBlockCompressed(blockNumber);

  if (!canonicalBlock) {
    return false;
  }

  const canonicalId = String(canonicalBlock.id).toLowerCase();
  const isTrunk = (
    canonicalBlock as unknown as { isTrunk?: unknown }
  ).isTrunk;

  return (
    canonicalId === blockId &&
    isTrunk !== false
  );
}

async function acquireRecoveryLock(
  network: string,
  ownerToken: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name: `automatic_reward_payout:${network}`,
      p_owner_token: ownerToken,
      p_lease_seconds: RECOVERY_LOCK_SECONDS,
    },
  );

  if (error) {
    throw new Error(
      `Submitted payout recovery lock could not be acquired: ${error.message}`,
    );
  }
  return data === true;
}

async function releaseRecoveryLock(
  network: string,
  ownerToken: string,
) {
  const { error } = await supabaseAdmin.rpc(
    'release_operator_lock',
    {
      p_lock_name: `automatic_reward_payout:${network}`,
      p_owner_token: ownerToken,
    },
  );

  if (error) {
    console.error(
      'Submitted payout recovery lock could not be released:',
      error,
    );
  }
}

async function markBroadcastConfirmed(
  manifestId: string,
  txId: string,
) {
  const { error } = await supabaseAdmin.rpc(
    'mark_reward_payout_broadcast_confirmed',
    {
      p_manifest_id: manifestId,
      p_tx_id: txId,
    },
  );

  if (error) {
    throw new Error(
      `Submitted payout broadcast confirmation could not be recorded: ${error.message}`,
    );
  }
}

/**
 * Reconciles only an already-submitted payout. It cannot prepare a round,
 * create a manifest, sign a transaction, or broadcast a new transaction.
 *
 * When the exact journaled transaction and a successful receipt are visible in
 * the current canonical chain but the block has not reached VeChain full
 * finality yet, recovery records a durable broadcast confirmation on the reward
 * round. That marker releases only the preparation gate for later claimed
 * batches. The payout remains PENDING and the invitation remains ELIGIBLE until
 * this same immutable transaction passes the full-finality manifest/event
 * verification below and is atomically PAID.
 */
export async function recoverSubmittedRewardPayout():
Promise<SubmittedPayoutRecoveryResult> {
  const { network } = getVeBetterNetworkConfig();
  const configuredDistributor = normalizeAddress(
    process.env.VEINVITE_REWARD_DISTRIBUTOR_ADDRESS,
  );
  const ownerToken = randomUUID();
  const acquired = await acquireRecoveryLock(network, ownerToken);

  if (!acquired) {
    return {
      status: 'LOCKED',
      roundId: null,
      manifestId: null,
      txId: null,
      reason: 'Another reward payout iteration is already running.',
    };
  }

  try {
    // Oldest-first is intentional once confirmed broadcasts may coexist with a
    // newer active batch. It prevents an older immutable submission from being
    // starved by subsequent claimed cohorts.
    const roundResult = await supabaseAdmin
      .from('reward_rounds')
      .select(
        'id, network, app_id, status, distributable_wei, eligible_count, created_at, broadcast_confirmed_at',
      )
      .eq('network', network)
      .in('status', ['CREATED', 'PAYING'])
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (roundResult.error) {
      throw new Error(
        `Submitted payout round could not be loaded: ${roundResult.error.message}`,
      );
    }
    if (!roundResult.data) {
      return {
        status: 'IDLE',
        roundId: null,
        manifestId: null,
        txId: null,
      };
    }

    const round = roundResult.data as RewardRoundForManifest & {
      created_at?: string;
      broadcast_confirmed_at?: string | null;
    };
    const roundId = positiveId(round.id, 'reward round id');

    if (String(round.status) !== 'CREATED') {
      return {
        status: 'MANUAL_INTERVENTION_REQUIRED',
        roundId,
        manifestId: null,
        txId: null,
        reason: 'Active reward round is in a legacy/manual paying state.',
      };
    }

    const manifestResult = await supabaseAdmin
      .from('reward_payout_manifests')
      .select(
        'id, manifest_version, x2earn_rewards_pool_address, operator_wallet, manifest_hash, payout_count, total_amount_wei, created_at',
      )
      .eq('round_id', roundId)
      .maybeSingle();

    if (manifestResult.error) {
      throw new Error(
        `Submitted payout manifest could not be loaded: ${manifestResult.error.message}`,
      );
    }
    if (!manifestResult.data) {
      return {
        status: 'IDLE',
        roundId,
        manifestId: null,
        txId: null,
      };
    }

    const manifestRow = manifestResult.data as Record<string, unknown>;
    const manifestId = positiveId(manifestRow.id, 'reward manifest id');
    const manifestOperator = normalizeAddress(manifestRow.operator_wallet);

    if (
      !configuredDistributor ||
      !manifestOperator ||
      configuredDistributor !== manifestOperator
    ) {
      return {
        status: 'MANUAL_INTERVENTION_REQUIRED',
        roundId,
        manifestId,
        txId: null,
        reason: 'Submitted payout manifest operator does not match the configured automatic distributor.',
      };
    }

    const [signedResult, submissionResult, checkpointResult, settlementResult, sourceResult] =
      await Promise.all([
        supabaseAdmin
          .from('reward_payout_signed_transactions')
          .select('tx_id, operator_wallet')
          .eq('manifest_id', manifestId)
          .maybeSingle(),
        supabaseAdmin
          .from('reward_payout_transaction_submissions')
          .select('tx_id, operator_wallet')
          .eq('manifest_id', manifestId)
          .maybeSingle(),
        supabaseAdmin
          .from('reward_payout_manifest_chain_checkpoints')
          .select('block_number')
          .eq('manifest_id', manifestId)
          .maybeSingle(),
        supabaseAdmin
          .from('reward_payout_transaction_settlements')
          .select('tx_id, paid_at')
          .eq('manifest_id', manifestId)
          .maybeSingle(),
        supabaseAdmin.rpc(
          'read_reward_manifest_source',
          { p_round_id: roundId },
        ),
      ]);

    for (const [label, result] of [
      ['signed transaction', signedResult],
      ['submission', submissionResult],
      ['checkpoint', checkpointResult],
      ['settlement', settlementResult],
      ['manifest source', sourceResult],
    ] as const) {
      if (result.error) {
        throw new Error(
          `Submitted payout ${label} could not be loaded: ${result.error.message}`,
        );
      }
    }

    if (settlementResult.data) {
      return {
        status: 'PAID',
        roundId,
        manifestId,
        txId: String(settlementResult.data.tx_id ?? ''),
      };
    }

    if (!submissionResult.data) {
      return {
        status: 'IDLE',
        roundId,
        manifestId,
        txId: null,
      };
    }

    const txId = String(submissionResult.data.tx_id ?? '')
      .trim()
      .toLowerCase();

    if (!HEX_32_PATTERN.test(txId)) {
      throw new Error('Submitted reward transaction id is invalid.');
    }

    if (!signedResult.data || !checkpointResult.data) {
      return {
        status: 'MANUAL_INTERVENTION_REQUIRED',
        roundId,
        manifestId,
        txId,
        reason: 'Submitted payout is missing its signed-transaction journal or immutable chain checkpoint.',
      };
    }

    if (
      String(signedResult.data.tx_id ?? '').toLowerCase() !== txId ||
      normalizeAddress(signedResult.data.operator_wallet) !== configuredDistributor ||
      normalizeAddress(submissionResult.data.operator_wallet) !== configuredDistributor
    ) {
      return {
        status: 'MANUAL_INTERVENTION_REQUIRED',
        roundId,
        manifestId,
        txId,
        reason: 'Submitted payout journal does not match the configured automatic distributor transaction.',
      };
    }

    const exactSource = sourceResult.data as {
      round?: RewardRoundForManifest | null;
      payouts?: RewardPayoutForManifest[];
      manifest?: Record<string, unknown> | null;
    } | null;

    if (
      !exactSource?.round ||
      !Array.isArray(exactSource.payouts) ||
      !exactSource.manifest
    ) {
      throw new Error(
        'Submitted payout manifest source returned malformed data.',
      );
    }

    const exactManifest = exactSource.manifest;

    if (
      positiveId(
        exactManifest.id,
        'exact reward manifest id',
      ) !== manifestId ||
      String(exactManifest.manifest_version ?? '') !==
        String(manifestRow.manifest_version ?? '')
    ) {
      throw new Error(
        'Exact reward manifest source disagrees with the submitted manifest.',
      );
    }

    const manifest = buildPayoutManifest({
      round: {
        ...round,
        ...exactSource.round,
        manifest_version:
          String(exactManifest.manifest_version ?? ''),
      },
      payouts: exactSource.payouts,
      x2EarnRewardsPoolAddress:
        String(manifestRow.x2earn_rewards_pool_address ?? ''),
    });

    if (
      manifest.manifestHash !== String(manifestRow.manifest_hash ?? '') ||
      manifest.totalAmountWei !==
        String(exactManifest.total_amount_wei ?? '') ||
      manifest.payoutCount !==
        Number(exactManifest.payout_count)
    ) {
      throw new Error('Submitted payout manifest drift was detected.');
    }

    let verified;
    try {
      verified = await verifyFinalizedRewardTransactionOnChain({
        txId,
        manifest,
        operatorWallet: configuredDistributor,
        manifestCreatedAt: String(manifestRow.created_at ?? ''),
      });
    } catch (error) {
      if (
        error instanceof RewardTransactionVerificationError &&
        error.code === 'TX_NOT_FINALIZED'
      ) {
        const canonicalSuccessfulReceipt =
          await observeCanonicalSuccessfulReceipt({
            txId,
            expectedOperator: configuredDistributor,
          });

        if (canonicalSuccessfulReceipt) {
          await markBroadcastConfirmed(manifestId, txId);
        }

        return {
          status: 'WAITING_FINALITY',
          roundId,
          manifestId,
          txId,
        };
      }

      if (
        error instanceof RewardTransactionVerificationError &&
        (
          error.code === 'TX_NOT_FOUND' ||
          error.code === 'TX_RECEIPT_NOT_FOUND'
        )
      ) {
        return {
          status: 'WAITING_FINALITY',
          roundId,
          manifestId,
          txId,
        };
      }
      throw error;
    }

    const checkpointBlock = Number(checkpointResult.data.block_number);
    if (
      !Number.isSafeInteger(checkpointBlock) ||
      verified.blockNumber <= checkpointBlock
    ) {
      throw new Error(
        'Submitted payout transaction does not occur strictly after its immutable chain checkpoint.',
      );
    }

    const { error: finalizeError } = await supabaseAdmin.rpc(
      'finalize_reward_payout_manifest',
      {
        p_manifest_id: manifestId,
        p_manifest_hash: manifest.manifestHash,
        p_tx_id: verified.txId,
        p_tx_origin: verified.txOrigin,
        p_block_id: verified.blockId,
        p_block_number: verified.blockNumber,
        p_block_timestamp: verified.blockTimestamp,
        p_finalized_head_id: verified.finalizedHeadId,
        p_finalized_head_number: verified.finalizedHeadNumber,
        p_clause_count: verified.clauseCount,
      },
    );

    if (finalizeError) {
      throw new Error(
        `Submitted payout settlement failed: ${finalizeError.message}`,
      );
    }

    return {
      status: 'PAID',
      roundId,
      manifestId,
      txId: verified.txId,
    };
  } finally {
    await releaseRecoveryLock(network, ownerToken);
  }
}
