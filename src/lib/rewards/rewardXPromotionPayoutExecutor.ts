import 'server-only';

import { randomUUID } from 'node:crypto';
import { Address, Hex, Transaction } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import { readVeInviteRewardPoolStatus } from '@/lib/rewards/onchainPool';
import {
  findCommittedPromotionIntentId,
  findEligibleFinalPromotionVerificationId,
  findPayablePromotionIntentId,
} from '@/lib/rewards/rewardXPromotionPayoutCandidates';
import {
  buildXPromotionPayoutManifest,
  type XPromotionPayoutManifest,
} from '@/lib/rewards/rewardXPromotionPayoutManifest';
import { verifyFinalizedXPromotionTransactionOnChain } from '@/lib/rewards/rewardXPromotionPayoutVerification';
import { RewardTransactionVerificationError } from '@/lib/rewards/transactionVerification';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig, type VeBetterNetwork } from '@/lib/vebetter/network';

const LOCK_SECONDS = 180;
const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/u;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/u;
const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/u;
const RAW_TX_PATTERN = /^0x[0-9a-f]+$/u;

export type RewardXPromotionPayoutStatus =
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

export type RewardXPromotionPayoutResult = {
  status: RewardXPromotionPayoutStatus;
  network: VeBetterNetwork;
  intentId: string | null;
  manifestId: string | null;
  txId: string | null;
  reason?: string;
  transfersPerformed: boolean;
};

type IntentState = {
  intent: Record<string, unknown>;
  manifest: Record<string, unknown> | null;
  checkpoint: Record<string, unknown> | null;
  signedTransaction: Record<string, unknown> | null;
  submission: Record<string, unknown> | null;
  settlement: Record<string, unknown> | null;
};

type DistributorIdentity = {
  automaticRewardsEnabled: boolean;
  workerEnabled: boolean;
  address: string | null;
  privateKeyHex: string | null;
};

function isTrue(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

function normalizeAddress(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ADDRESS_PATTERN.test(normalized) ? normalized : null;
}

function positiveId(value: unknown, name: string): string {
  const normalized = String(value ?? '');
  if (!/^\d+$/u.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error(`X promotion ${name} is invalid.`);
  }
  return BigInt(normalized).toString();
}

function result(
  network: VeBetterNetwork,
  status: RewardXPromotionPayoutStatus,
  values: Partial<Omit<RewardXPromotionPayoutResult, 'network' | 'status'>> = {},
): RewardXPromotionPayoutResult {
  return {
    status,
    network,
    intentId: values.intentId ?? null,
    manifestId: values.manifestId ?? null,
    txId: values.txId ?? null,
    reason: values.reason,
    transfersPerformed: values.transfersPerformed ?? false,
  };
}

function readDistributorIdentity(): DistributorIdentity {
  const automaticRewardsEnabled = isTrue(
    process.env.VEINVITE_AUTOMATIC_REWARDS_ENABLED,
  );
  const workerEnabled = isTrue(
    process.env.VEINVITE_X_PROMOTION_PAYOUT_WORKER_ENABLED,
  );
  const address = normalizeAddress(
    process.env.VEINVITE_REWARD_DISTRIBUTOR_ADDRESS,
  );
  const rawKey =
    process.env.VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY?.trim() ?? null;

  if (!automaticRewardsEnabled || !workerEnabled || !address || !rawKey) {
    return {
      automaticRewardsEnabled,
      workerEnabled,
      address,
      privateKeyHex: null,
    };
  }
  if (!PRIVATE_KEY_PATTERN.test(rawKey)) {
    throw new Error('X promotion payout private key has an invalid format.');
  }

  const privateKeyHex = rawKey.startsWith('0x')
    ? rawKey.toLowerCase()
    : `0x${rawKey.toLowerCase()}`;
  const bytes = Hex.of(privateKeyHex).bytes;
  try {
    if (
      Address.ofPrivateKey(bytes).toString().toLowerCase() !== address
    ) {
      throw new Error(
        'X promotion payout private key does not match the configured reward distributor.',
      );
    }
  } finally {
    bytes.fill(0);
  }

  return {
    automaticRewardsEnabled,
    workerEnabled,
    address,
    privateKeyHex,
  };
}

async function readRuntimeGate() {
  const query = await supabaseAdmin
    .from('reward_runtime_config')
    .select('reward_x_promotion_enabled,reward_x_promotion_payout_enabled,reward_x_promotion_live_started_at')
    .eq('id', 1)
    .single();

  if (query.error || !query.data) {
    throw new Error(
      `X promotion runtime gate could not be loaded: ${query.error?.message ?? 'missing row'}`,
    );
  }

  return {
    liveEnabled: query.data.reward_x_promotion_enabled === true,
    payoutEnabled: query.data.reward_x_promotion_payout_enabled === true,
    liveStartedAt:
      typeof query.data.reward_x_promotion_live_started_at === 'string'
        ? query.data.reward_x_promotion_live_started_at
        : null,
  };
}

async function acquireSharedPayoutLock(
  network: VeBetterNetwork,
  ownerToken: string,
) {
  const { data, error } = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name: `automatic_reward_payout:${network}`,
      p_owner_token: ownerToken,
      p_lease_seconds: LOCK_SECONDS,
    },
  );
  if (error) {
    throw new Error(
      `X promotion payout lock could not be acquired: ${error.message}`,
    );
  }
  return data === true;
}

async function releaseSharedPayoutLock(
  network: VeBetterNetwork,
  ownerToken: string,
) {
  const { error } = await supabaseAdmin.rpc('release_operator_lock', {
    p_lock_name: `automatic_reward_payout:${network}`,
    p_owner_token: ownerToken,
  });
  if (error) {
    console.error('X promotion payout lock could not be released:', error);
  }
}

async function coreRewardWorkPending(network: VeBetterNetwork) {
  const [queue, round] = await Promise.all([
    supabaseAdmin
      .from('reward_queue_entries')
      .select('id')
      .eq('network', network)
      .eq('status', 'QUEUED')
      .is('assigned_round_id', null)
      .limit(1),
    supabaseAdmin
      .from('reward_rounds')
      .select('id')
      .eq('network', network)
      .in('status', ['CREATED', 'PAYING'])
      .is('broadcast_confirmed_at', null)
      .limit(1),
  ]);

  if (queue.error) {
    throw new Error(`Core reward queue priority check failed: ${queue.error.message}`);
  }
  if (round.error) {
    throw new Error(`Core reward round priority check failed: ${round.error.message}`);
  }
  return (queue.data?.length ?? 0) > 0 || (round.data?.length ?? 0) > 0;
}

async function readOutstandingLiability(
  network: VeBetterNetwork,
  appId: string,
) {
  const { data, error } = await supabaseAdmin.rpc(
    'read_outstanding_reward_liability',
    { p_network: network, p_app_id: appId },
  );
  if (error) {
    throw new Error(`X promotion liability preflight failed: ${error.message}`);
  }
  const normalized = String(data ?? '');
  if (!/^\d+$/u.test(normalized)) {
    throw new Error('X promotion liability preflight returned malformed data.');
  }
  return BigInt(normalized);
}


async function createIntent(verificationId: string) {
  const { data, error } = await supabaseAdmin.rpc(
    'create_reward_x_promotion_payout_intent_v1',
    { p_verification_id: verificationId },
  );
  if (error) {
    throw new Error(`X promotion payout intent creation failed: ${error.message}`);
  }
  if (!data || typeof data !== 'object' || !('intentId' in data)) {
    throw new Error('X promotion payout intent creation returned malformed data.');
  }
  return positiveId(data.intentId, 'created intent id');
}

async function loadIntentState(intentId: string): Promise<IntentState> {
  const [
    intent,
    manifest,
    checkpoint,
    signedTransaction,
    submission,
    settlement,
  ] = await Promise.all([
    supabaseAdmin
      .from('reward_x_promotion_payout_intents')
      .select('id,network,invite_code,recipient_wallet,amount_wei,public_proof_id,created_at')
      .eq('id', intentId)
      .single(),
    supabaseAdmin
      .from('reward_x_promotion_payout_manifests')
      .select('id,intent_id,network,app_id,x2earn_rewards_pool_address,operator_wallet,manifest_hash,clause,created_at')
      .eq('intent_id', intentId)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_x_promotion_payout_checkpoints')
      .select('intent_id,manifest_id,manifest_hash,block_number')
      .eq('intent_id', intentId)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_x_promotion_payout_signed_transactions')
      .select('id,intent_id,manifest_id,manifest_hash,tx_id,operator_wallet,raw_tx_hex')
      .eq('intent_id', intentId)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_x_promotion_payout_submissions')
      .select('id,intent_id,manifest_id,manifest_hash,tx_id,operator_wallet')
      .eq('intent_id', intentId)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_x_promotion_payout_settlements')
      .select('id,intent_id,tx_id,paid_at')
      .eq('intent_id', intentId)
      .maybeSingle(),
  ]);

  for (const [name, query] of [
    ['intent', intent],
    ['manifest', manifest],
    ['checkpoint', checkpoint],
    ['signed transaction', signedTransaction],
    ['submission', submission],
    ['settlement', settlement],
  ] as const) {
    if (query.error) {
      throw new Error(`X promotion ${name} could not be loaded: ${query.error.message}`);
    }
  }
  if (!intent.data) throw new Error('X promotion payout intent is missing.');

  return {
    intent: intent.data as Record<string, unknown>,
    manifest: manifest.data as Record<string, unknown> | null,
    checkpoint: checkpoint.data as Record<string, unknown> | null,
    signedTransaction: signedTransaction.data as Record<string, unknown> | null,
    submission: submission.data as Record<string, unknown> | null,
    settlement: settlement.data as Record<string, unknown> | null,
  };
}

function rebuildStoredManifest(state: IntentState): XPromotionPayoutManifest {
  if (!state.manifest) throw new Error('X promotion payout manifest is missing.');

  const manifest = buildXPromotionPayoutManifest({
    intentId: String(state.intent.id),
    network: String(state.intent.network) as VeBetterNetwork,
    appId: String(state.manifest.app_id),
    x2EarnRewardsPoolAddress: String(state.manifest.x2earn_rewards_pool_address),
    operatorWallet: String(state.manifest.operator_wallet),
    inviteCode: String(state.intent.invite_code),
    recipientWallet: String(state.intent.recipient_wallet),
    amountWei: String(state.intent.amount_wei),
    publicProofId: String(state.intent.public_proof_id),
  });

  if (manifest.manifestHash !== String(state.manifest.manifest_hash)) {
    throw new Error('X promotion payout manifest drift was detected.');
  }
  return manifest;
}

async function ensureManifest(
  state: IntentState,
  distributorAddress: string,
  appId: string,
  poolAddress: string,
) {
  if (state.manifest) return;

  const manifest = buildXPromotionPayoutManifest({
    intentId: String(state.intent.id),
    network: String(state.intent.network) as VeBetterNetwork,
    appId,
    x2EarnRewardsPoolAddress: poolAddress,
    operatorWallet: distributorAddress,
    inviteCode: String(state.intent.invite_code),
    recipientWallet: String(state.intent.recipient_wallet),
    amountWei: String(state.intent.amount_wei),
    publicProofId: String(state.intent.public_proof_id),
  });

  const { error } = await supabaseAdmin.rpc(
    'create_reward_x_promotion_payout_manifest_v1',
    {
      p_intent_id: String(state.intent.id),
      p_app_id: manifest.appId,
      p_x2earn_rewards_pool_address: manifest.x2EarnRewardsPoolAddress,
      p_operator_wallet: manifest.operatorWallet,
      p_manifest_hash: manifest.manifestHash,
      p_proof_text: manifest.proofText,
      p_proof_link: manifest.proofLink,
      p_description: manifest.description,
      p_clause: manifest.clause,
    },
  );
  if (error) {
    throw new Error(`X promotion manifest creation failed: ${error.message}`);
  }
}

async function ensureCheckpoint(intentId: string, checkpoint: Record<string, unknown> | null) {
  if (checkpoint) return;

  const { nodeUrl } = getVeBetterNetworkConfig();
  const bestBlock = await ThorClient.at(nodeUrl).blocks.getBestBlockCompressed();
  if (!bestBlock) {
    throw new Error('X promotion payout checkpoint block is unavailable.');
  }

  const blockId = String(bestBlock.id).toLowerCase();
  const blockNumber = Number(bestBlock.number);
  const blockTimestamp = Number(bestBlock.timestamp);
  if (
    !HEX_32_PATTERN.test(blockId) ||
    !Number.isSafeInteger(blockNumber) ||
    !Number.isSafeInteger(blockTimestamp)
  ) {
    throw new Error('X promotion payout checkpoint block is invalid.');
  }

  const { error } = await supabaseAdmin.rpc(
    'create_reward_x_promotion_payout_checkpoint_v1',
    {
      p_intent_id: intentId,
      p_block_id: blockId,
      p_block_number: blockNumber,
      p_block_timestamp: blockTimestamp,
    },
  );
  if (error) {
    throw new Error(`X promotion checkpoint creation failed: ${error.message}`);
  }
}

async function signAndJournal(
  manifest: XPromotionPayoutManifest,
  intentId: string,
  distributorAddress: string,
  privateKeyHex: string,
  network: VeBetterNetwork,
) {
  if (await coreRewardWorkPending(network)) return null;

  const [pool, outstandingLiability] = await Promise.all([
    readVeInviteRewardPoolStatus(),
    readOutstandingLiability(network, manifest.appId),
  ]);

  if (
    manifest.network !== network ||
    pool.appId.toLowerCase() !== manifest.appId.toLowerCase() ||
    pool.x2EarnRewardsPoolAddress.toLowerCase() !==
      manifest.x2EarnRewardsPoolAddress.toLowerCase()
  ) {
    throw new Error('X promotion payout manifest target no longer matches runtime.');
  }
  if (manifest.operatorWallet.toLowerCase() !== distributorAddress) {
    throw new Error('X promotion payout manifest signer no longer matches runtime.');
  }
  if (network === 'mainnet' && !pool.mainnetFundedRewardsEnabled) {
    throw new Error('Mainnet funded rewards were disabled before X promotion signing.');
  }
  if (pool.distributionPaused) {
    throw new Error('Reward distribution was paused before X promotion signing.');
  }
  if (distributorAddress === pool.appAdmin) {
    throw new Error('X promotion distributor must remain separate from the app admin.');
  }
  if (!pool.rewardDistributors.includes(distributorAddress)) {
    throw new Error('X promotion distributor is no longer registered.');
  }

  const poolBalance = BigInt(pool.effectiveRewardPoolWei);
  if (poolBalance < outstandingLiability) {
    throw new Error(
      'Reward pool no longer covers all outstanding liabilities before X promotion signing.',
    );
  }
  if (poolBalance < BigInt(manifest.amountWei)) {
    throw new Error('Reward pool cannot cover the X promotion payout.');
  }

  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const clauses = [{
    to: manifest.clause.to,
    value: manifest.clause.value,
    data: manifest.clause.data,
  }];
  const [gasResult, bestBlock] = await Promise.all([
    thor.gas.estimateGas(clauses, distributorAddress),
    thor.blocks.getBestBlockCompressed(),
  ]);
  if (!bestBlock) throw new Error('VeChain best block is unavailable before signing.');

  const estimatedGas = Number(gasResult.totalGas);
  const blockGasLimit = Number(
    (bestBlock as unknown as { gasLimit?: unknown }).gasLimit,
  );
  if (
    !Number.isSafeInteger(estimatedGas) ||
    estimatedGas < 1 ||
    !Number.isSafeInteger(blockGasLimit) ||
    blockGasLimit < 1 ||
    estimatedGas > Math.floor(blockGasLimit * 0.8)
  ) {
    throw new Error('X promotion payout gas estimate is outside the conservative limit.');
  }

  const [runtimeBeforeSign, securityBeforeSign] = await Promise.all([
    readRuntimeGate(),
    supabaseAdmin.rpc(
      'reward_x_promotion_security_clear_v1',
      {
        p_invite_code: manifest.inviteCode,
        p_network: network,
      },
    ),
  ]);

  if (!runtimeBeforeSign.liveEnabled || !runtimeBeforeSign.liveStartedAt) {
    throw new Error('X promotion LIVE was disabled before signing.');
  }
  if (!runtimeBeforeSign.payoutEnabled) {
    throw new Error('X promotion payout was disabled before signing.');
  }
  if (securityBeforeSign.error) {
    throw new Error(
      `X promotion security pre-sign check failed: ${securityBeforeSign.error.message}`,
    );
  }
  if (securityBeforeSign.data !== true) {
    throw new Error('X promotion security clearance changed before signing.');
  }
  if (await coreRewardWorkPending(network)) return null;

  const body = await thor.transactions.buildTransactionBody(
    clauses,
    gasResult.totalGas,
  );
  const bytes = Hex.of(privateKeyHex).bytes;
  try {
    const signed = Transaction.of(body).sign(bytes);
    const txId = signed.id.toString().toLowerCase();
    const rawTxHex = Hex.of(signed.encoded).toString().toLowerCase();
    if (!HEX_32_PATTERN.test(txId) || !RAW_TX_PATTERN.test(rawTxHex)) {
      throw new Error('X promotion signing produced invalid transaction data.');
    }

    const { error } = await supabaseAdmin.rpc(
      'register_reward_x_promotion_signed_submission_v1',
      {
        p_intent_id: intentId,
        p_tx_id: txId,
        p_operator_wallet: distributorAddress,
        p_raw_tx_hex: rawTxHex,
      },
    );
    if (error) {
      throw new Error(
        `X promotion signed submission could not be journaled: ${error.message}`,
      );
    }
    return { txId, rawTxHex };
  } finally {
    bytes.fill(0);
  }
}

function isNotFoundError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error))
    .toLowerCase();
  return message.includes('404') || message.includes('not found');
}

async function broadcastExactSignedTransaction(txId: string, rawTxHex: string) {
  const signed = Transaction.decode(Hex.of(rawTxHex).bytes, true);
  const decodedTxId = signed.id.toString().toLowerCase();
  if (decodedTxId !== txId) {
    throw new Error(
      'Journaled X promotion raw transaction does not match its transaction id.',
    );
  }

  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);

  try {
    if (await thor.transactions.getTransaction(txId)) return false;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  const sent = await thor.transactions.sendTransaction(signed);
  if (String(sent.id).toLowerCase() !== txId) {
    throw new Error(
      'VeChain returned a different transaction id for the X promotion payout.',
    );
  }
  return true;
}

async function finalizeIfPossible(
  state: IntentState,
  manifest: XPromotionPayoutManifest,
) {
  if (!state.checkpoint || !state.signedTransaction || !state.submission || !state.manifest) {
    throw new Error('X promotion finality evidence is incomplete.');
  }

  const txId = String(state.submission.tx_id ?? '').trim().toLowerCase();
  if (!HEX_32_PATTERN.test(txId)) {
    throw new Error('X promotion submitted transaction id is invalid.');
  }

  let verified;
  try {
    verified = await verifyFinalizedXPromotionTransactionOnChain({
      txId,
      manifest,
      manifestCreatedAt: String(state.manifest.created_at),
    });
  } catch (error) {
    if (
      error instanceof RewardTransactionVerificationError &&
      ['TX_NOT_FOUND', 'TX_RECEIPT_NOT_FOUND', 'TX_NOT_FINALIZED'].includes(error.code)
    ) {
      return 'WAITING_FINALITY' as const;
    }
    throw error;
  }

  const checkpointBlock = Number(state.checkpoint.block_number);
  if (!Number.isSafeInteger(checkpointBlock) || verified.blockNumber <= checkpointBlock) {
    throw new Error(
      'X promotion payout transaction did not occur after its immutable checkpoint.',
    );
  }

  const { error } = await supabaseAdmin.rpc(
    'finalize_reward_x_promotion_payout_v1',
    {
      p_intent_id: String(state.intent.id),
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
  if (error) {
    throw new Error(`X promotion payout settlement failed: ${error.message}`);
  }
  return 'PAID' as const;
}

async function recoverCommittedLocked(
  network: VeBetterNetwork,
  intentId: string,
): Promise<RewardXPromotionPayoutResult> {
  const state = await loadIntentState(intentId);
  if (state.settlement) {
    return result(network, 'PAID', {
      intentId,
      manifestId: state.manifest ? String(state.manifest.id) : null,
      txId: String(state.settlement.tx_id ?? '') || null,
    });
  }
  if (!state.manifest || !state.checkpoint || !state.signedTransaction || !state.submission) {
    return result(network, 'MANUAL_INTERVENTION_REQUIRED', {
      intentId,
      manifestId: state.manifest ? String(state.manifest.id) : null,
      txId: state.submission ? String(state.submission.tx_id ?? '') || null : null,
      reason: 'Committed X promotion payout is missing immutable journal evidence.',
    });
  }

  const signedTxId = String(state.signedTransaction.tx_id ?? '').trim().toLowerCase();
  const submittedTxId = String(state.submission.tx_id ?? '').trim().toLowerCase();
  const rawTxHex = String(state.signedTransaction.raw_tx_hex ?? '').trim().toLowerCase();
  if (
    signedTxId !== submittedTxId ||
    !HEX_32_PATTERN.test(submittedTxId) ||
    !RAW_TX_PATTERN.test(rawTxHex)
  ) {
    return result(network, 'MANUAL_INTERVENTION_REQUIRED', {
      intentId,
      manifestId: String(state.manifest.id),
      txId: submittedTxId || null,
      reason: 'Committed X promotion payout transaction journal is inconsistent.',
    });
  }

  const manifest = rebuildStoredManifest(state);
  const transferred = await broadcastExactSignedTransaction(submittedTxId, rawTxHex);
  const finalState = await finalizeIfPossible(state, manifest);
  return result(network, finalState, {
    intentId,
    manifestId: String(state.manifest.id),
    txId: submittedTxId,
    transfersPerformed: transferred,
  });
}

/**
 * Dormant pre-LIVE executor.
 *
 * No cron or route imports this module yet. New signing needs BOTH the dedicated
 * worker env flag and DB LIVE. The current DB activation interlock still blocks
 * LIVE, so merging this module cannot transfer B3TR.
 *
 * An already signed+journaled transaction is different: recovery may rebroadcast
 * and finalize that exact immutable transaction even after new signing is
 * disabled. That prevents a restart or operator switch from orphaning committed
 * money and mirrors the existing referral payout recovery model.
 */
export async function runRewardXPromotionPayout():
Promise<RewardXPromotionPayoutResult> {
  const { network } = getVeBetterNetworkConfig();

  const committedIntentId = await findCommittedPromotionIntentId(network);
  if (committedIntentId) {
    const ownerToken = randomUUID();
    if (!(await acquireSharedPayoutLock(network, ownerToken))) {
      return result(network, 'LOCKED', { intentId: committedIntentId });
    }
    try {
      return await recoverCommittedLocked(network, committedIntentId);
    } finally {
      await releaseSharedPayoutLock(network, ownerToken);
    }
  }

  const runtime = await readRuntimeGate();
  if (!runtime.liveEnabled || !runtime.liveStartedAt) {
    return result(network, 'DISABLED', {
      reason: 'X promotion LIVE is disabled.',
    });
  }
  if (!runtime.payoutEnabled) {
    return result(network, 'DISABLED', {
      reason: 'X promotion payout is disabled.',
    });
  }

  const identity = readDistributorIdentity();
  if (!identity.automaticRewardsEnabled || !identity.workerEnabled) {
    return result(network, 'DISABLED', {
      reason: 'X promotion payout worker is not enabled.',
    });
  }
  if (!identity.address || !identity.privateKeyHex) {
    return result(network, 'NOT_CONFIGURED', {
      reason: 'X promotion payout credentials are incomplete.',
    });
  }

  const ownerToken = randomUUID();
  if (!(await acquireSharedPayoutLock(network, ownerToken))) {
    return result(network, 'LOCKED');
  }

  try {
    if (await coreRewardWorkPending(network)) {
      return result(network, 'IDLE', {
        reason: 'Core referral reward payout has priority.',
      });
    }

    const pool = await readVeInviteRewardPoolStatus();
    if (network === 'mainnet' && !pool.mainnetFundedRewardsEnabled) {
      return result(network, 'DISABLED', {
        reason: 'Mainnet funded rewards are disabled.',
      });
    }
    if (pool.distributionPaused) {
      return result(network, 'DISABLED', {
        reason: 'Reward distribution is paused.',
      });
    }
    if (identity.address === pool.appAdmin) {
      throw new Error(
        'X promotion distributor must be separate from the VeInvite app admin.',
      );
    }
    if (!pool.rewardDistributors.includes(identity.address)) {
      return result(network, 'NOT_REGISTERED', {
        reason: 'Configured reward distributor is not registered on-chain.',
      });
    }

    let intentId = await findPayablePromotionIntentId(network);
    if (!intentId) {
      const verificationId = await findEligibleFinalPromotionVerificationId(network);
      if (!verificationId) return result(network, 'IDLE');
      intentId = await createIntent(verificationId);
    }

    let state = await loadIntentState(intentId);
    if (Boolean(state.signedTransaction) !== Boolean(state.submission)) {
      return result(network, 'MANUAL_INTERVENTION_REQUIRED', {
        intentId,
        reason: 'X promotion signed/submission journal is partial.',
      });
    }
    if (state.signedTransaction && state.submission) {
      return await recoverCommittedLocked(network, intentId);
    }

    await ensureManifest(
      state,
      identity.address,
      pool.appId,
      pool.x2EarnRewardsPoolAddress,
    );
    state = await loadIntentState(intentId);
    if (!state.manifest) throw new Error('X promotion manifest could not be reloaded.');

    await ensureCheckpoint(intentId, state.checkpoint);
    state = await loadIntentState(intentId);
    if (!state.manifest || !state.checkpoint) {
      throw new Error('X promotion payout preparation evidence is incomplete.');
    }

    const manifest = rebuildStoredManifest(state);
    const signed = await signAndJournal(
      manifest,
      intentId,
      identity.address,
      identity.privateKeyHex,
      network,
    );
    if (!signed) {
      return result(network, 'PREPARED', {
        intentId,
        manifestId: String(state.manifest.id),
        reason: 'Core referral reward appeared before X promotion signing.',
      });
    }

    const transferred = await broadcastExactSignedTransaction(
      signed.txId,
      signed.rawTxHex,
    );
    return result(network, 'SUBMITTED', {
      intentId,
      manifestId: String(state.manifest.id),
      txId: signed.txId,
      transfersPerformed: transferred,
    });
  } finally {
    await releaseSharedPayoutLock(network, ownerToken);
  }
}
