import { randomUUID } from 'node:crypto';

import {
  Address,
  Hex,
  Transaction,
} from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  syncVeInviteAllocationReceipts,
} from '@/lib/rewards/allocationAccounting';
import {
  buildPayoutManifest,
  type PayoutManifest,
} from '@/lib/rewards/payoutManifest';
import {
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  readPredictiveRewardPlanning,
} from '@/lib/rewards/predictivePlanning';
import {
  readRewardRuntimeSafety,
} from '@/lib/rewards/runtimeSafety';
import {
  RewardTransactionVerificationError,
  verifyFinalizedRewardTransactionOnChain,
} from '@/lib/rewards/transactionVerification';
import {
  refreshQueuedReferralSignalChecks,
} from '@/lib/sybil/vePassportSignals';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const AUTO_PAYOUT_LOCK_SECONDS = 180;
const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;
const RAW_TX_PATTERN = /^0x[0-9a-f]+$/;

export type AutomaticRewardPayoutStatus =
  | 'DISABLED'
  | 'NOT_CONFIGURED'
  | 'NOT_REGISTERED'
  | 'LOCKED'
  | 'IDLE'
  | 'PREPARED'
  | 'SUBMITTED'
  | 'WAITING_FINALITY'
  | 'PAID'
  | 'MANUAL_INTERVENTION_REQUIRED';

export type AutomaticRewardPayoutResult = {
  status: AutomaticRewardPayoutStatus;
  network: string;
  distributorAddress: string | null;
  roundId: string | null;
  manifestId: string | null;
  txId: string | null;
  queuedCount?: number;
  reason?: string;
  transfersPerformed: boolean;
};

type AutomaticDistributorIdentity = {
  enabled: boolean;
  expectedAddress: string | null;
  privateKeyHex: string | null;
};

type ActiveRewardState = {
  round: Record<string, unknown> | null;
  payouts: Record<string, unknown>[];
  manifest: Record<string, unknown> | null;
  checkpoint: Record<string, unknown> | null;
  signedTransaction: Record<string, unknown> | null;
  submission: Record<string, unknown> | null;
  settlement: Record<string, unknown> | null;
};

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function normalizeAddress(
  value: string | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && ADDRESS_PATTERN.test(normalized)
    ? normalized
    : null;
}

function readAutomaticDistributorIdentity():
AutomaticDistributorIdentity {
  const enabled = isTrue(
    process.env.VEINVITE_AUTOMATIC_REWARDS_ENABLED,
  );
  const expectedAddress = normalizeAddress(
    process.env.VEINVITE_REWARD_DISTRIBUTOR_ADDRESS,
  );
  const rawPrivateKey =
    process.env.VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY?.trim() ?? null;

  if (!enabled) {
    return {
      enabled: false,
      expectedAddress,
      privateKeyHex: null,
    };
  }

  if (!expectedAddress || !rawPrivateKey) {
    return {
      enabled: true,
      expectedAddress,
      privateKeyHex: null,
    };
  }

  if (!PRIVATE_KEY_PATTERN.test(rawPrivateKey)) {
    throw new Error(
      'Automatic reward distributor private key has an invalid format.',
    );
  }

  const privateKeyHex = rawPrivateKey.startsWith('0x')
    ? rawPrivateKey.toLowerCase()
    : `0x${rawPrivateKey.toLowerCase()}`;
  const privateKeyBytes = Hex.of(privateKeyHex).bytes;

  try {
    const derivedAddress = Address
      .ofPrivateKey(privateKeyBytes)
      .toString()
      .toLowerCase();

    if (derivedAddress !== expectedAddress) {
      throw new Error(
        'Automatic reward distributor private key does not match the configured public address.',
      );
    }
  } finally {
    privateKeyBytes.fill(0);
  }

  return {
    enabled: true,
    expectedAddress,
    privateKeyHex,
  };
}

export function readAutomaticRewardDistributorReadiness() {
  const identity = readAutomaticDistributorIdentity();

  return {
    enabled: identity.enabled,
    configured: Boolean(
      identity.expectedAddress &&
      identity.privateKeyHex,
    ),
    distributorAddress:
      identity.expectedAddress,
  };
}

async function acquireAutomaticPayoutLock(
  network: string,
  ownerToken: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name: `automatic_reward_payout:${network}`,
      p_owner_token: ownerToken,
      p_lease_seconds: AUTO_PAYOUT_LOCK_SECONDS,
    },
  );

  if (error) {
    throw new Error(
      `Automatic payout lock could not be acquired: ${error.message}`,
    );
  }

  return data === true;
}

async function releaseAutomaticPayoutLock(
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
      'Automatic payout lock could not be released:',
      error,
    );
  }
}

function positiveId(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '');

  if (!/^\d+$/.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return BigInt(normalized).toString();
}

async function loadActiveRewardState(
  network: string,
  appId: string,
): Promise<ActiveRewardState> {
  const roundResult = await supabaseAdmin
    .from('reward_rounds')
    .select(
      'id, network, app_id, status, reward_budget_epoch_id, observed_pool_balance_wei, reserved_before_round_wei, distributable_wei, eligible_count, per_reward_wei, remainder_wei, created_at',
    )
    .eq('network', network)
    .eq('app_id', appId)
    .in('status', ['CREATED', 'PAYING'])
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (roundResult.error) {
    throw new Error(
      `Active reward round could not be loaded: ${roundResult.error.message}`,
    );
  }

  const round = roundResult.data as Record<string, unknown> | null;

  if (!round) {
    return {
      round: null,
      payouts: [],
      manifest: null,
      checkpoint: null,
      signedTransaction: null,
      submission: null,
      settlement: null,
    };
  }

  const roundId = positiveId(round.id, 'round id');
  const payoutResult = await supabaseAdmin
    .from('reward_payouts')
    .select(
      'id, invite_code, recipient_wallet, amount_wei, status, tx_id',
    )
    .eq('round_id', roundId)
    .order('id', { ascending: true });

  if (payoutResult.error) {
    throw new Error(
      `Reward payouts could not be loaded: ${payoutResult.error.message}`,
    );
  }

  const manifestResult = await supabaseAdmin
    .from('reward_payout_manifests')
    .select(
      'id, round_id, manifest_version, network, app_id, x2earn_rewards_pool_address, operator_wallet, manifest_hash, payout_count, total_amount_wei, clauses, created_at',
    )
    .eq('round_id', roundId)
    .maybeSingle();

  if (manifestResult.error) {
    throw new Error(
      `Reward payout manifest could not be loaded: ${manifestResult.error.message}`,
    );
  }

  const manifest =
    manifestResult.data as Record<string, unknown> | null;

  if (!manifest) {
    return {
      round,
      payouts:
        (payoutResult.data ?? []) as Record<string, unknown>[],
      manifest: null,
      checkpoint: null,
      signedTransaction: null,
      submission: null,
      settlement: null,
    };
  }

  const manifestId = positiveId(
    manifest.id,
    'manifest id',
  );
  const [
    checkpointResult,
    signedResult,
    submissionResult,
    settlementResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('reward_payout_manifest_chain_checkpoints')
      .select(
        'manifest_id, block_id, block_number, block_timestamp, recorded_at',
      )
      .eq('manifest_id', manifestId)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_payout_signed_transactions')
      .select(
        'id, manifest_id, round_id, network, manifest_hash, tx_id, operator_wallet, raw_tx_hex, created_at',
      )
      .eq('manifest_id', manifestId)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_payout_transaction_submissions')
      .select(
        'id, manifest_id, round_id, network, manifest_hash, tx_id, operator_wallet, registered_at',
      )
      .eq('manifest_id', manifestId)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_payout_transaction_settlements')
      .select(
        'id, manifest_id, round_id, network, manifest_hash, tx_id, tx_origin, block_id, block_number, block_timestamp, finalized_head_id, finalized_head_number, clause_count, verified_at, paid_at',
      )
      .eq('manifest_id', manifestId)
      .maybeSingle(),
  ]);

  for (const [label, result] of [
    ['checkpoint', checkpointResult],
    ['signed transaction', signedResult],
    ['submission', submissionResult],
    ['settlement', settlementResult],
  ] as const) {
    if (result.error) {
      throw new Error(
        `Reward ${label} could not be loaded: ${result.error.message}`,
      );
    }
  }

  return {
    round,
    payouts:
      (payoutResult.data ?? []) as Record<string, unknown>[],
    manifest,
    checkpoint:
      checkpointResult.data as Record<string, unknown> | null,
    signedTransaction:
      signedResult.data as Record<string, unknown> | null,
    submission:
      submissionResult.data as Record<string, unknown> | null,
    settlement:
      settlementResult.data as Record<string, unknown> | null,
  };
}

async function prepareRewardRound({
  network,
  appId,
  poolBalanceWei,
}: {
  network: string;
  appId: string;
  poolBalanceWei: string;
}): Promise<string | null> {
  const allocationSync =
    await syncVeInviteAllocationReceipts();
  const allocationReceipt =
    allocationSync.latestReceipt;

  if (!allocationReceipt) {
    return null;
  }

  await refreshQueuedReferralSignalChecks({ network });

  const planning = await readPredictiveRewardPlanning({
    network,
    appId,
    observedPoolBalanceWei: poolBalanceWei,
  });

  if (!planning.latestAllocation || !planning.forecast) {
    return null;
  }

  if (
    planning.latestAllocation.id !==
    String(allocationReceipt.id)
  ) {
    throw new Error(
      'Automatic reward planning did not resolve the latest allocation receipt.',
    );
  }

  const { data, error } = await supabaseAdmin.rpc(
    'prepare_predictive_reward_batch',
    {
      p_network: network,
      p_app_id: appId,
      p_pool_balance_wei: poolBalanceWei,
      p_allocation_receipt_id:
        planning.latestAllocation.id,
      p_expected_completions:
        planning.forecast.expectedCompletions,
      p_stress_completions:
        planning.forecast.stressCompletions,
      p_reward_per_invite_wei:
        planning.forecast.rewardPerInviteWei,
      p_algorithm_version:
        planning.forecast.algorithmVersion,
      p_pipeline_snapshot:
        planning.forecast.pipeline,
    },
  );

  if (error) {
    throw new Error(
      `prepare_predictive_reward_batch failed: ${error.message}`,
    );
  }

  if (!data || typeof data !== 'object') {
    throw new Error(
      'prepare_predictive_reward_batch returned malformed data.',
    );
  }

  const roundId =
    'roundId' in data ? data.roundId : null;

  if (roundId === null || roundId === undefined) {
    return null;
  }

  return positiveId(roundId, 'prepared round id');
}

async function createManifest({
  state,
  distributorAddress,
  poolAddress,
}: {
  state: ActiveRewardState;
  distributorAddress: string;
  poolAddress: string;
}): Promise<string> {
  if (!state.round) {
    throw new Error('Reward round is missing.');
  }

  const manifest = buildPayoutManifest({
    round: state.round as never,
    payouts: state.payouts as never,
    x2EarnRewardsPoolAddress: poolAddress,
  });

  const { data, error } = await supabaseAdmin.rpc(
    'create_reward_payout_manifest',
    {
      p_round_id: manifest.roundId,
      p_operator_wallet: distributorAddress,
      p_pool_address:
        manifest.x2EarnRewardsPoolAddress,
      p_manifest_hash: manifest.manifestHash,
      p_clauses: manifest.clauses,
    },
  );

  if (error) {
    throw new Error(
      `create_reward_payout_manifest failed: ${error.message}`,
    );
  }

  if (!data || typeof data !== 'object' || !('manifest_id' in data)) {
    throw new Error(
      'create_reward_payout_manifest returned malformed data.',
    );
  }

  return positiveId(
    data.manifest_id,
    'created manifest id',
  );
}

async function ensureCheckpoint(
  manifestId: string,
): Promise<Record<string, unknown>> {
  const existingResult = await supabaseAdmin
    .from('reward_payout_manifest_chain_checkpoints')
    .select(
      'manifest_id, block_id, block_number, block_timestamp, recorded_at',
    )
    .eq('manifest_id', manifestId)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(
      `Manifest checkpoint could not be checked: ${existingResult.error.message}`,
    );
  }

  if (existingResult.data) {
    return existingResult.data as Record<string, unknown>;
  }

  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const bestBlock =
    await thor.blocks.getBestBlockCompressed();

  if (!bestBlock) {
    throw new Error(
      'VeChain best block could not be loaded for automatic payout checkpoint.',
    );
  }

  const blockId = String(bestBlock.id).toLowerCase();
  const blockNumber = Number(bestBlock.number);
  const blockTimestamp = Number(bestBlock.timestamp);

  if (
    !HEX_32_PATTERN.test(blockId) ||
    !Number.isSafeInteger(blockNumber) ||
    !Number.isSafeInteger(blockTimestamp)
  ) {
    throw new Error(
      'VeChain checkpoint block metadata is invalid.',
    );
  }

  const { error } = await supabaseAdmin.rpc(
    'create_reward_payout_manifest_chain_checkpoint',
    {
      p_manifest_id: manifestId,
      p_block_id: blockId,
      p_block_number: blockNumber,
      p_block_timestamp: blockTimestamp,
    },
  );

  if (error) {
    throw new Error(
      `create_reward_payout_manifest_chain_checkpoint failed: ${error.message}`,
    );
  }

  return {
    manifest_id: manifestId,
    block_id: blockId,
    block_number: blockNumber,
    block_timestamp: blockTimestamp,
  };
}

function rebuildManifest(
  state: ActiveRewardState,
  poolAddress: string,
): PayoutManifest {
  if (!state.round || !state.manifest) {
    throw new Error(
      'Reward round or manifest is missing.',
    );
  }

  const manifest = buildPayoutManifest({
    round: state.round as never,
    payouts: state.payouts as never,
    x2EarnRewardsPoolAddress: poolAddress,
  });

  if (
    manifest.manifestHash !==
      String(state.manifest.manifest_hash) ||
    manifest.totalAmountWei !==
      String(state.manifest.total_amount_wei) ||
    manifest.payoutCount !==
      Number(state.manifest.payout_count)
  ) {
    throw new Error(
      'Automatic payout manifest drift was detected.',
    );
  }

  return manifest;
}

async function signAndJournalTransaction({
  manifest,
  manifestId,
  distributorAddress,
  privateKeyHex,
  poolBalanceWei,
}: {
  manifest: PayoutManifest;
  manifestId: string;
  distributorAddress: string;
  privateKeyHex: string;
  poolBalanceWei: string;
}) {
  if (
    BigInt(poolBalanceWei) <
    BigInt(manifest.totalAmountWei)
  ) {
    throw new Error(
      'Automatic payout is larger than the current reward pool balance.',
    );
  }

  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const clauses = manifest.clauses.map(
    (clause) => ({
      to: clause.to,
      value: clause.value,
      data: clause.data,
    }),
  );
  const [gasResult, bestBlock] = await Promise.all([
    thor.gas.estimateGas(
      clauses,
      distributorAddress,
    ),
    thor.blocks.getBestBlockCompressed(),
  ]);

  if (!bestBlock) {
    throw new Error(
      'VeChain best block could not be loaded for automatic payout preflight.',
    );
  }

  const estimatedGas = Number(gasResult.totalGas);
  const blockGasLimit = Number(
    (bestBlock as unknown as { gasLimit?: unknown })
      .gasLimit,
  );

  if (
    !Number.isSafeInteger(estimatedGas) ||
    estimatedGas < 1 ||
    !Number.isSafeInteger(blockGasLimit) ||
    blockGasLimit < 1
  ) {
    throw new Error(
      'Automatic payout gas estimate is invalid.',
    );
  }

  if (estimatedGas > Math.floor(blockGasLimit * 0.8)) {
    throw new Error(
      'Automatic payout batch exceeds the conservative VeChain gas ceiling.',
    );
  }

  const txBody =
    await thor.transactions.buildTransactionBody(
      clauses,
      gasResult.totalGas,
    );
  const privateKeyBytes = Hex.of(privateKeyHex).bytes;

  try {
    const signed = Transaction
      .of(txBody)
      .sign(privateKeyBytes);
    const txId = signed.id
      .toString()
      .toLowerCase();
    const rawTxHex = Hex
      .of(signed.encoded)
      .toString()
      .toLowerCase();

    if (
      !HEX_32_PATTERN.test(txId) ||
      !RAW_TX_PATTERN.test(rawTxHex)
    ) {
      throw new Error(
        'Automatic reward signing produced invalid transaction data.',
      );
    }

    const { error: signedError } =
      await supabaseAdmin.rpc(
        'register_reward_payout_signed_transaction',
        {
          p_manifest_id: manifestId,
          p_tx_id: txId,
          p_operator_wallet:
            distributorAddress,
          p_raw_tx_hex: rawTxHex,
        },
      );

    if (signedError) {
      throw new Error(
        `Signed payout transaction could not be journaled: ${signedError.message}`,
      );
    }

    const { error: submissionError } =
      await supabaseAdmin.rpc(
        'register_reward_payout_transaction_submission',
        {
          p_manifest_id: manifestId,
          p_tx_id: txId,
          p_operator_wallet:
            distributorAddress,
        },
      );

    if (submissionError) {
      throw new Error(
        `Automatic payout submission could not be registered: ${submissionError.message}`,
      );
    }

    return {
      txId,
      rawTxHex,
    };
  } finally {
    privateKeyBytes.fill(0);
  }
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : String(error).toLowerCase();

  return (
    message.includes('404') ||
    message.includes('not found')
  );
}

async function broadcastSignedTransaction({
  txId,
  rawTxHex,
}: {
  txId: string;
  rawTxHex: string;
}): Promise<boolean> {
  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);

  try {
    const existing =
      await thor.transactions.getTransaction(txId);

    if (existing) {
      return false;
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  const signed = Transaction.decode(
    Hex.of(rawTxHex).bytes,
    true,
  );
  const sent =
    await thor.transactions.sendTransaction(signed);
  const sentId = String(sent.id).toLowerCase();

  if (sentId !== txId) {
    throw new Error(
      'VeChain returned a different transaction id for the automatic payout.',
    );
  }

  return true;
}

async function finalizeIfPossible({
  state,
  manifest,
  distributorAddress,
}: {
  state: ActiveRewardState;
  manifest: PayoutManifest;
  distributorAddress: string;
}): Promise<'PAID' | 'WAITING_FINALITY'> {
  if (
    !state.manifest ||
    !state.checkpoint ||
    !state.submission
  ) {
    throw new Error(
      'Automatic payout finalization evidence is incomplete.',
    );
  }

  const manifestId = positiveId(
    state.manifest.id,
    'manifest id',
  );
  const txId = String(
    state.submission.tx_id ?? '',
  ).toLowerCase();

  if (!HEX_32_PATTERN.test(txId)) {
    throw new Error(
      'Registered automatic payout transaction id is invalid.',
    );
  }

  let verified;

  try {
    verified =
      await verifyFinalizedRewardTransactionOnChain({
        txId,
        manifest,
        operatorWallet: distributorAddress,
        manifestCreatedAt:
          String(state.manifest.created_at),
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
      return 'WAITING_FINALITY';
    }

    throw error;
  }

  const checkpointBlock = Number(
    state.checkpoint.block_number,
  );

  if (
    !Number.isSafeInteger(checkpointBlock) ||
    verified.blockNumber <= checkpointBlock
  ) {
    throw new Error(
      'Automatic payout transaction does not occur strictly after its immutable chain checkpoint.',
    );
  }

  const { error } = await supabaseAdmin.rpc(
    'finalize_reward_payout_manifest',
    {
      p_manifest_id: manifestId,
      p_manifest_hash: manifest.manifestHash,
      p_tx_id: verified.txId,
      p_tx_origin: verified.txOrigin,
      p_block_id: verified.blockId,
      p_block_number: verified.blockNumber,
      p_block_timestamp:
        verified.blockTimestamp,
      p_finalized_head_id:
        verified.finalizedHeadId,
      p_finalized_head_number:
        verified.finalizedHeadNumber,
      p_clause_count: verified.clauseCount,
    },
  );

  if (error) {
    throw new Error(
      `Automatic payout settlement failed: ${error.message}`,
    );
  }

  return 'PAID';
}

async function countQueuedRewards(
  network: string,
): Promise<number> {
  const result = await supabaseAdmin
    .from('reward_queue_entries')
    .select('id', { count: 'exact', head: true })
    .eq('network', network)
    .eq('status', 'QUEUED')
    .is('assigned_round_id', null);

  if (result.error) {
    throw new Error(
      `Automatic reward queue could not be counted: ${result.error.message}`,
    );
  }

  return result.count ?? 0;
}

/**
 * Runs one idempotent automatic payout iteration. The function is deliberately
 * fail-closed: without an explicit enable flag, matching server-only key,
 * registered on-chain Reward Distributor address, funded runtime gate, healthy
 * pool and immutable financial evidence, it cannot sign or transfer B3TR.
 *
 * A signed raw transaction is journaled before broadcast. If the serverless
 * process or RPC fails after signing, the next iteration rebroadcasts the exact
 * same transaction id instead of creating a second payment.
 */
export async function runAutomaticRewardPayout():
Promise<AutomaticRewardPayoutResult> {
  const { network } = getVeBetterNetworkConfig();
  const identity = readAutomaticDistributorIdentity();

  if (!identity.enabled) {
    return {
      status: 'DISABLED',
      network,
      distributorAddress:
        identity.expectedAddress,
      roundId: null,
      manifestId: null,
      txId: null,
      reason:
        'Automatic reward payouts are not enabled.',
      transfersPerformed: false,
    };
  }

  if (
    !identity.expectedAddress ||
    !identity.privateKeyHex
  ) {
    return {
      status: 'NOT_CONFIGURED',
      network,
      distributorAddress:
        identity.expectedAddress,
      roundId: null,
      manifestId: null,
      txId: null,
      reason:
        'Automatic reward distributor server credentials are incomplete.',
      transfersPerformed: false,
    };
  }

  const distributorAddress =
    identity.expectedAddress;
  const pool =
    await readVeInviteRewardPoolStatus();
  const runtime =
    await readRewardRuntimeSafety();

  if (
    network === 'mainnet' &&
    !runtime.mainnetFundedRewardsEnabled
  ) {
    return {
      status: 'DISABLED',
      network,
      distributorAddress,
      roundId: null,
      manifestId: null,
      txId: null,
      reason:
        'Mainnet funded rewards are disabled.',
      transfersPerformed: false,
    };
  }

  if (
    runtime.emergencyRewardsPaused ||
    pool.distributionPaused
  ) {
    return {
      status: 'DISABLED',
      network,
      distributorAddress,
      roundId: null,
      manifestId: null,
      txId: null,
      reason:
        'Reward distribution is paused.',
      transfersPerformed: false,
    };
  }

  if (distributorAddress === pool.appAdmin) {
    throw new Error(
      'Automatic Reward Distributor must be separate from the VeInvite app admin wallet.',
    );
  }

  if (
    !pool.rewardDistributors.includes(
      distributorAddress,
    )
  ) {
    return {
      status: 'NOT_REGISTERED',
      network,
      distributorAddress,
      roundId: null,
      manifestId: null,
      txId: null,
      reason:
        'Dedicated automatic address is not registered as a VeBetterDAO Reward Distributor.',
      transfersPerformed: false,
    };
  }

  const ownerToken = randomUUID();
  const acquired = await acquireAutomaticPayoutLock(
    network,
    ownerToken,
  );

  if (!acquired) {
    return {
      status: 'LOCKED',
      network,
      distributorAddress,
      roundId: null,
      manifestId: null,
      txId: null,
      reason:
        'Another automatic payout iteration is already running.',
      transfersPerformed: false,
    };
  }

  try {
    let state = await loadActiveRewardState(
      network,
      pool.appId,
    );
    let queuedCount = await countQueuedRewards(
      network,
    );

    if (!state.round) {
      if (queuedCount < 1) {
        return {
          status: 'IDLE',
          network,
          distributorAddress,
          roundId: null,
          manifestId: null,
          txId: null,
          queuedCount,
          transfersPerformed: false,
        };
      }

      const roundId = await prepareRewardRound({
        network,
        appId: pool.appId,
        poolBalanceWei:
          pool.effectiveRewardPoolWei,
      });

      if (!roundId) {
        return {
          status: 'IDLE',
          network,
          distributorAddress,
          roundId: null,
          manifestId: null,
          txId: null,
          queuedCount,
          reason:
            'No funded predictive reward capacity is currently available.',
          transfersPerformed: false,
        };
      }

      state = await loadActiveRewardState(
        network,
        pool.appId,
      );
      queuedCount = await countQueuedRewards(
        network,
      );
    }

    if (!state.round) {
      throw new Error(
        'Prepared automatic reward round could not be reloaded.',
      );
    }

    const roundId = positiveId(
      state.round.id,
      'active reward round id',
    );

    if (String(state.round.status) !== 'CREATED') {
      return {
        status: 'MANUAL_INTERVENTION_REQUIRED',
        network,
        distributorAddress,
        roundId,
        manifestId: state.manifest
          ? positiveId(
              state.manifest.id,
              'manifest id',
            )
          : null,
        txId: state.submission
          ? String(state.submission.tx_id)
          : null,
        reason:
          'Active reward round is in a legacy/manual paying state.',
        transfersPerformed: false,
      };
    }

    if (!state.manifest) {
      await createManifest({
        state,
        distributorAddress,
        poolAddress:
          pool.x2EarnRewardsPoolAddress,
      });
      state = await loadActiveRewardState(
        network,
        pool.appId,
      );
    }

    if (!state.manifest) {
      throw new Error(
        'Automatic payout manifest could not be reloaded.',
      );
    }

    const manifestId = positiveId(
      state.manifest.id,
      'automatic manifest id',
    );

    if (
      String(state.manifest.operator_wallet)
        .toLowerCase() !== distributorAddress
    ) {
      return {
        status: 'MANUAL_INTERVENTION_REQUIRED',
        network,
        distributorAddress,
        roundId,
        manifestId,
        txId: state.submission
          ? String(state.submission.tx_id)
          : null,
        reason:
          'Active payout manifest belongs to the manual operator wallet.',
        transfersPerformed: false,
      };
    }

    if (!state.checkpoint) {
      await ensureCheckpoint(manifestId);
      state = await loadActiveRewardState(
        network,
        pool.appId,
      );
    }

    const manifest = rebuildManifest(
      state,
      pool.x2EarnRewardsPoolAddress,
    );

    if (state.settlement) {
      return {
        status: 'PAID',
        network,
        distributorAddress,
        roundId,
        manifestId,
        txId: String(state.settlement.tx_id),
        queuedCount,
        transfersPerformed: false,
      };
    }

    if (state.submission) {
      const txId = String(
        state.submission.tx_id,
      ).toLowerCase();

      if (!state.signedTransaction) {
        return {
          status: 'MANUAL_INTERVENTION_REQUIRED',
          network,
          distributorAddress,
          roundId,
          manifestId,
          txId,
          queuedCount,
          reason:
            'Existing transaction was not created by the automatic distributor worker.',
          transfersPerformed: false,
        };
      }

      const rawTxHex = String(
        state.signedTransaction.raw_tx_hex,
      ).toLowerCase();

      if (
        txId !== String(
          state.signedTransaction.tx_id,
        ).toLowerCase() ||
        !RAW_TX_PATTERN.test(rawTxHex)
      ) {
        throw new Error(
          'Automatic signed transaction journal does not match the registered submission.',
        );
      }

      let transferred = false;

      try {
        transferred =
          await broadcastSignedTransaction({
            txId,
            rawTxHex,
          });
      } catch (error) {
        console.error(
          'Automatic reward rebroadcast failed:',
          error,
        );
      }

      const finalization =
        await finalizeIfPossible({
          state,
          manifest,
          distributorAddress,
        });

      return {
        status: finalization,
        network,
        distributorAddress,
        roundId,
        manifestId,
        txId,
        queuedCount,
        transfersPerformed: transferred,
      };
    }

    const signed = await signAndJournalTransaction({
      manifest,
      manifestId,
      distributorAddress,
      privateKeyHex: identity.privateKeyHex,
      poolBalanceWei:
        pool.effectiveRewardPoolWei,
    });

    const transferred =
      await broadcastSignedTransaction(signed);

    return {
      status: 'SUBMITTED',
      network,
      distributorAddress,
      roundId,
      manifestId,
      txId: signed.txId,
      queuedCount,
      transfersPerformed: transferred,
    };
  } finally {
    await releaseAutomaticPayoutLock(
      network,
      ownerToken,
    );
  }
}
