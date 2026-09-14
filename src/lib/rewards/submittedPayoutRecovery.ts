import 'server-only';

import { randomUUID } from 'node:crypto';

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
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  return ADDRESS_PATTERN.test(normalized)
    ? normalized
    : null;
}

function positiveId(value: unknown, fieldName: string): string {
  const normalized = String(value ?? '');

  if (!/^\d+$/.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return BigInt(normalized).toString();
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

/**
 * Finalizes an already-submitted automatic reward transaction without ever
 * preparing a reward round, creating a manifest, signing a transaction, or
 * broadcasting a new transaction. This is intentionally narrower than the
 * automatic payout worker so a late VeChain finality event can be reconciled
 * promptly without creating a duplicate-payment path.
 */
export async function recoverSubmittedRewardPayout():
Promise<SubmittedPayoutRecoveryResult> {
  const { network } = getVeBetterNetworkConfig();
  const configuredDistributor = normalizeAddress(
    process.env.VEINVITE_REWARD_DISTRIBUTOR_ADDRESS,
  );
  const ownerToken = randomUUID();
  const acquired = await acquireRecoveryLock(
    network,
    ownerToken,
  );

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
    const roundResult = await supabaseAdmin
      .from('reward_rounds')
      .select(
        'id, network, app_id, status, distributable_wei, eligible_count, manifest_version, created_at',
      )
      .eq('network', network)
      .in('status', ['CREATED', 'PAYING'])
      .order('id', { ascending: false })
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
        'id, round_id, manifest_version, network, app_id, x2earn_rewards_pool_address, operator_wallet, manifest_hash, payout_count, total_amount_wei, created_at',
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
    const manifestId = positiveId(
      manifestRow.id,
      'reward manifest id',
    );
    const manifestOperator = normalizeAddress(
      manifestRow.operator_wallet,
    );

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

    const [
      signedResult,
      submissionResult,
      checkpointResult,
      settlementResult,
      sourceResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('reward_payout_signed_transactions')
        .select(
          'manifest_id, round_id, tx_id, operator_wallet',
        )
        .eq('manifest_id', manifestId)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_payout_transaction_submissions')
        .select(
          'manifest_id, round_id, tx_id, operator_wallet',
        )
        .eq('manifest_id', manifestId)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_payout_manifest_chain_checkpoints')
        .select(
          'manifest_id, block_id, block_number, block_timestamp',
        )
        .eq('manifest_id', manifestId)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_payout_transaction_settlements')
        .select('manifest_id, round_id, tx_id, paid_at')
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

    const settlement = settlementResult.data as
      | Record<string, unknown>
      | null;

    if (settlement) {
      return {
        status: 'PAID',
        roundId,
        manifestId,
        txId: String(settlement.tx_id ?? ''),
      };
    }

    const signed = signedResult.data as
      | Record<string, unknown>
      | null;
    const submission = submissionResult.data as
      | Record<string, unknown>
      | null;
    const checkpoint = checkpointResult.data as
      | Record<string, unknown>
      | null;

    if (!submission) {
      return {
        status: 'IDLE',
        roundId,
        manifestId,
        txId: null,
      };
    }

    const txId = String(submission.tx_id ?? '')
      .trim()
      .toLowerCase();

    if (!HEX_32_PATTERN.test(txId)) {
      throw new Error(
        'Submitted reward transaction id is invalid.',
      );
    }

    if (!signed || !checkpoint) {
      return {
        status: 'MANUAL_INTERVENTION_REQUIRED',
        roundId,
        manifestId,
        txId,
        reason: 'Submitted payout is missing its signed-transaction journal or immutable chain checkpoint.',
      };
    }

    if (
      String(signed.tx_id ?? '').toLowerCase() !== txId ||
      normalizeAddress(signed.operator_wallet) !== configuredDistributor ||
      normalizeAddress(submission.operator_wallet) !== configuredDistributor
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
    } | null;

    if (
      !exactSource?.round ||
      !Array.isArray(exactSource.payouts)
    ) {
      throw new Error(
        'Submitted payout manifest source returned malformed data.',
      );
    }

    const manifest = buildPayoutManifest({
      round: {
        ...round,
        ...exactSource.round,
        manifest_version:
          String(manifestRow.manifest_version ?? ''),
      },
      payouts: exactSource.payouts,
      x2EarnRewardsPoolAddress:
        String(manifestRow.x2earn_rewards_pool_address ?? ''),
    });

    if (
      manifest.manifestHash !==
        String(manifestRow.manifest_hash ?? '') ||
      manifest.totalAmountWei !==
        String(manifestRow.total_amount_wei ?? '') ||
      manifest.payoutCount !==
        Number(manifestRow.payout_count)
    ) {
      throw new Error(
        'Submitted payout manifest drift was detected.',
      );
    }

    let verified;

    try {
      verified =
        await verifyFinalizedRewardTransactionOnChain({
          txId,
          manifest,
          operatorWallet: configuredDistributor,
          manifestCreatedAt:
            String(manifestRow.created_at ?? ''),
        });
    } catch (error) {
      if (
        error instanceof RewardTransactionVerificationError &&
        (
          error.code === 'TX_NOT_FOUND' ||
          error.code === 'TX_RECEIPT_NOT_FOUND' ||
          error.code === 'TX_NOT_FINALIZED'
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

    const checkpointBlock = Number(
      checkpoint.block_number,
    );

    if (
      !Number.isSafeInteger(checkpointBlock) ||
      verified.blockNumber <= checkpointBlock
    ) {
      throw new Error(
        'Submitted payout transaction does not occur strictly after its immutable chain checkpoint.',
      );
    }

    const { error: finalizeError } =
      await supabaseAdmin.rpc(
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
    await releaseRecoveryLock(
      network,
      ownerToken,
    );
  }
}
