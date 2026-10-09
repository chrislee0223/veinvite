import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  Address,
  Hex,
  Transaction,
} from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  buildXPromotionPayoutManifest,
  type XPromotionPayoutManifest,
} from '@/lib/rewards/rewardXPromotionPayoutManifest';
import {
  verifyFinalizedXPromotionTransactionOnChain,
} from '@/lib/rewards/rewardXPromotionPayoutVerification';
import {
  RewardTransactionVerificationError,
} from '@/lib/rewards/transactionVerification';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const LOCK_SECONDS = 180;
const PRIVATE_KEY_PATTERN =
  /^(?:0x)?[0-9a-fA-F]{64}$/u;
const ADDRESS_PATTERN =
  /^0x[0-9a-f]{40}$/u;
const HEX_32_PATTERN =
  /^0x[0-9a-f]{64}$/u;
const RAW_TX_PATTERN =
  /^0x[0-9a-f]+$/u;

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

type RuntimeGate = {
  liveEnabled: boolean;
  liveStartedAt: string | null;
};

type DistributorIdentity = {
  automaticRewardsEnabled: boolean;
  workerEnabled: boolean;
  expectedAddress: string | null;
  privateKeyHex: string | null;
};

type IntentState = {
  intent: Record<string, unknown>;
  manifest: Record<string, unknown> | null;
  checkpoint: Record<string, unknown> | null;
  signedTransaction: Record<string, unknown> | null;
  submission: Record<string, unknown> | null;
  settlement: Record<string, unknown> | null;
};

function isTrue(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

function normalizeAddress(
  value: unknown,
): string | null {
  const normalized =
    String(value ?? '')
      .trim()
      .toLowerCase();

  return ADDRESS_PATTERN.test(normalized)
    ? normalized
    : null;
}

function positiveId(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    String(value ?? '');

  if (
    !/^\d+$/u.test(normalized) ||
    BigInt(normalized) < 1n
  ) {
    throw new Error(
      `X promotion ${fieldName} is invalid.`,
    );
  }

  return BigInt(normalized).toString();
}

function readDistributorIdentity():
DistributorIdentity {
  const automaticRewardsEnabled =
    isTrue(
      process.env
        .VEINVITE_AUTOMATIC_REWARDS_ENABLED,
    );
  const workerEnabled =
    isTrue(
      process.env
        .VEINVITE_X_PROMOTION_PAYOUT_WORKER_ENABLED,
    );
  const expectedAddress =
    normalizeAddress(
      process.env
        .VEINVITE_REWARD_DISTRIBUTOR_ADDRESS,
    );
  const rawPrivateKey =
    process.env
      .VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY
      ?.trim() ?? null;

  if (
    !automaticRewardsEnabled ||
    !workerEnabled ||
    !expectedAddress ||
    !rawPrivateKey
  ) {
    return {
      automaticRewardsEnabled,
      workerEnabled,
      expectedAddress,
      privateKeyHex: null,
    };
  }

  if (
    !PRIVATE_KEY_PATTERN.test(
      rawPrivateKey,
    )
  ) {
    throw new Error(
      'X promotion payout private key has an invalid format.',
    );
  }

  const privateKeyHex =
    rawPrivateKey.startsWith('0x')
      ? rawPrivateKey.toLowerCase()
      : `0x${rawPrivateKey.toLowerCase()}`;
  const keyBytes =
    Hex.of(privateKeyHex).bytes;

  try {
    const derivedAddress =
      Address
        .ofPrivateKey(keyBytes)
        .toString()
        .toLowerCase();

    if (
      derivedAddress !==
      expectedAddress
    ) {
      throw new Error(
        'X promotion payout private key does not match the configured reward distributor.',
      );
    }
  } finally {
    keyBytes.fill(0);
  }

  return {
    automaticRewardsEnabled,
    workerEnabled,
    expectedAddress,
    privateKeyHex,
  };
}

async function readRuntimeGate():
Promise<RuntimeGate> {
  const result =
    await supabaseAdmin
      .from('reward_runtime_config')
      .select(
        'reward_x_promotion_enabled,reward_x_promotion_live_started_at',
      )
      .eq('id', 1)
      .single();

  if (
    result.error ||
    !result.data
  ) {
    throw new Error(
      `X promotion runtime gate could not be loaded: ${result.error?.message ?? 'missing row'}`,
    );
  }

  return {
    liveEnabled:
      result.data
        .reward_x_promotion_enabled === true,
    liveStartedAt:
      typeof result.data
        .reward_x_promotion_live_started_at ===
        'string'
        ? result.data
            .reward_x_promotion_live_started_at
        : null,
  };
}

async function acquireSharedPayoutLock(
  network: VeBetterNetwork,
  ownerToken: string,
) {
  const { data, error } =
    await supabaseAdmin.rpc(
      'try_acquire_operator_lock',
      {
        p_lock_name:
          `automatic_reward_payout:${network}`,
        p_owner_token:
          ownerToken,
        p_lease_seconds:
          LOCK_SECONDS,
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
  const { error } =
    await supabaseAdmin.rpc(
      'release_operator_lock',
      {
        p_lock_name:
          `automatic_reward_payout:${network}`,
        p_owner_token:
          ownerToken,
      },
    );

  if (error) {
    console.error(
      'X promotion payout lock could not be released:',
      error,
    );
  }
}

async function coreRewardWorkPending(
  network: VeBetterNetwork,
) {
  const [
    queueResult,
    roundResult,
  ] = await Promise.all([
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
      .in('status', [
        'CREATED',
        'PAYING',
      ])
      .is(
        'broadcast_confirmed_at',
        null,
      )
      .limit(1),
  ]);

  if (queueResult.error) {
    throw new Error(
      `Core reward queue priority check failed: ${queueResult.error.message}`,
    );
  }
  if (roundResult.error) {
    throw new Error(
      `Core reward round priority check failed: ${roundResult.error.message}`,
    );
  }

  return (
    (queueResult.data?.length ?? 0) > 0 ||
    (roundResult.data?.length ?? 0) > 0
  );
}

async function readOutstandingLiability(
  network: VeBetterNetwork,
  appId: string,
) {
  const { data, error } =
    await supabaseAdmin.rpc(
      'read_outstanding_reward_liability',
      {
        p_network: network,
        p_app_id: appId,
      },
    );

  if (error) {
    throw new Error(
      `X promotion liability preflight failed: ${error.message}`,
    );
  }

  const normalized =
    String(data ?? '');

  if (!/^\d+$/u.test(normalized)) {
    throw new Error(
      'X promotion liability preflight returned malformed data.',
    );
  }

  return BigInt(normalized);
}

async function findUnsettledIntentId(
  network: VeBetterNetwork,
): Promise<string | null> {
  const intents =
    await supabaseAdmin
      .from(
        'reward_x_promotion_payout_intents',
      )
      .select('id')
      .eq('network', network)
      .order('id', {
        ascending: true,
      })
      .limit(50);

  if (intents.error) {
    throw new Error(
      `X promotion payout intents could not be loaded: ${intents.error.message}`,
    );
  }

  for (
    const row of intents.data ?? []
  ) {
    const intentId =
      positiveId(
        row.id,
        'intent id',
      );
    const settlement =
      await supabaseAdmin
        .from(
          'reward_x_promotion_payout_settlements',
        )
        .select('id')
        .eq('intent_id', intentId)
        .maybeSingle();

    if (settlement.error) {
      throw new Error(
        `X promotion payout settlement lookup failed: ${settlement.error.message}`,
      );
    }

    if (!settlement.data) {
      return intentId;
    }
  }

  return null;
}

async function findFinalVerificationId(
  network: VeBetterNetwork,
): Promise<string | null> {
  const result =
    await supabaseAdmin
      .from(
        'reward_x_promotion_post_verifications',
      )
      .select(
        'id,invite_code,obligation_id',
      )
      .eq('network', network)
      .eq(
        'verification_state',
        'FINAL_VERIFIED',
      )
      .is('invalidated_at', null)
      .order('final_verified_at', {
        ascending: true,
      })
      .limit(25);

  if (result.error) {
    throw new Error(
      `Final X promotion verifications could not be loaded: ${result.error.message}`,
    );
  }

  for (
    const row of result.data ?? []
  ) {
    const existing =
      await supabaseAdmin
        .from(
          'reward_x_promotion_payout_intents',
        )
        .select('id')
        .eq(
          'verification_id',
          row.id,
        )
        .maybeSingle();

    if (existing.error) {
      throw new Error(
        `X promotion payout intent candidate check failed: ${existing.error.message}`,
      );
    }
    if (existing.data) {
      continue;
    }

    const obligation =
      await supabaseAdmin
        .from(
          'reward_x_promotion_obligations',
        )
        .select(
          'financial_state',
        )
        .eq(
          'id',
          row.obligation_id,
        )
        .maybeSingle();

    if (obligation.error) {
      throw new Error(
        `X promotion obligation candidate check failed: ${obligation.error.message}`,
      );
    }
    if (
      obligation.data
        ?.financial_state !== 'HELD'
    ) {
      continue;
    }

    const security =
      await supabaseAdmin.rpc(
        'reward_x_promotion_security_clear_v1',
        {
          p_invite_code:
            row.invite_code,
          p_network: network,
        },
      );

    if (security.error) {
      throw new Error(
        `X promotion security candidate check failed: ${security.error.message}`,
      );
    }
    if (security.data !== true) {
      continue;
    }

    return positiveId(
      row.id,
      'verification id',
    );
  }

  return null;
}

async function createIntent(
  verificationId: string,
) {
  const { data, error } =
    await supabaseAdmin.rpc(
      'create_reward_x_promotion_payout_intent_v1',
      {
        p_verification_id:
          verificationId,
      },
    );

  if (error) {
    throw new Error(
      `X promotion payout intent creation failed: ${error.message}`,
    );
  }
  if (
    !data ||
    typeof data !== 'object' ||
    !('intentId' in data)
  ) {
    throw new Error(
      'X promotion payout intent creation returned malformed data.',
    );
  }

  return positiveId(
    data.intentId,
    'created intent id',
  );
}

async function loadIntentState(
  intentId: string,
): Promise<IntentState> {
  const [
    intentResult,
    manifestResult,
    checkpointResult,
    signedResult,
    submissionResult,
    settlementResult,
  ] = await Promise.all([
    supabaseAdmin
      .from(
        'reward_x_promotion_payout_intents',
      )
      .select(
        'id,network,invite_code,recipient_wallet,amount_wei,public_proof_id,created_at',
      )
      .eq('id', intentId)
      .single(),
    supabaseAdmin
      .from(
        'reward_x_promotion_payout_manifests',
      )
      .select(
        'id,intent_id,manifest_version,network,app_id,x2earn_rewards_pool_address,operator_wallet,manifest_hash,invite_code,recipient_wallet,amount_wei,public_proof_id,proof_text,proof_link,description,clause,created_at',
      )
      .eq('intent_id', intentId)
      .maybeSingle(),
    supabaseAdmin
      .from(
        'reward_x_promotion_payout_checkpoints',
      )
      .select(
        'intent_id,manifest_id,manifest_hash,network,block_id,block_number,block_timestamp,recorded_at',
      )
      .eq('intent_id', intentId)
      .maybeSingle(),
    supabaseAdmin
      .from(
        'reward_x_promotion_payout_signed_transactions',
      )
      .select(
        'id,intent_id,manifest_id,manifest_hash,network,tx_id,operator_wallet,raw_tx_hex,created_at',
      )
      .eq('intent_id', intentId)
      .maybeSingle(),
    supabaseAdmin
      .from(
        'reward_x_promotion_payout_submissions',
      )
      .select(
        'id,intent_id,manifest_id,manifest_hash,signed_transaction_id,network,tx_id,operator_wallet,registered_at',
      )
      .eq('intent_id', intentId)
      .maybeSingle(),
    supabaseAdmin
      .from(
        'reward_x_promotion_payout_settlements',
      )
      .select(
        'id,intent_id,tx_id,paid_at',
      )
      .eq('intent_id', intentId)
      .maybeSingle(),
  ]);

  for (
    const [label, result] of [
      ['intent', intentResult],
      ['manifest', manifestResult],
      ['checkpoint', checkpointResult],
      ['signed transaction', signedResult],
      ['submission', submissionResult],
      ['settlement', settlementResult],
    ] as const
  ) {
    if (result.error) {
      throw new Error(
        `X promotion ${label} could not be loaded: ${result.error.message}`,
      );
    }
  }

  if (!intentResult.data) {
    throw new Error(
      'X promotion payout intent is missing.',
    );
  }

  return {
    intent:
      intentResult.data as Record<
        string,
        unknown
      >,
    manifest:
      manifestResult.data as Record<
        string,
        unknown
      > | null,
    checkpoint:
      checkpointResult.data as Record<
        string,
        unknown
      > | null,
    signedTransaction:
      signedResult.data as Record<
        string,
        unknown
      > | null,
    submission:
      submissionResult.data as Record<
        string,
        unknown
      > | null,
    settlement:
      settlementResult.data as Record<
        string,
        unknown
      > | null,
  };
}

function rebuildStoredManifest(
  state: IntentState,
): XPromotionPayoutManifest {
  if (!state.manifest) {
    throw new Error(
      'X promotion payout manifest is missing.',
    );
  }

  const manifest =
    buildXPromotionPayoutManifest({
      intentId:
        String(state.intent.id),
      network:
        String(
          state.intent.network,
        ) as VeBetterNetwork,
      appId:
        String(
          state.manifest.app_id,
        ),
      x2EarnRewardsPoolAddress:
        String(
          state.manifest
            .x2earn_rewards_pool_address,
        ),
      operatorWallet:
        String(
          state.manifest
            .operator_wallet,
        ),
      inviteCode:
        String(
          state.intent.invite_code,
        ),
      recipientWallet:
        String(
          state.intent
            .recipient_wallet,
        ),
      amountWei:
        String(
          state.intent.amount_wei,
        ),
      publicProofId:
        String(
          state.intent
            .public_proof_id,
        ),
    });

  if (
    manifest.manifestHash !==
      String(
        state.manifest
          .manifest_hash,
      ) ||
    JSON.stringify(
      manifest.clause,
    ) !==
      JSON.stringify(
        state.manifest.clause,
      )
  ) {
    throw new Error(
      'X promotion payout manifest drift was detected.',
    );
  }

  return manifest;
}

async function ensureManifest({
  state,
  distributorAddress,
  poolAddress,
  appId,
}: {
  state: IntentState;
  distributorAddress: string;
  poolAddress: string;
  appId: string;
}) {
  if (state.manifest) {
    return;
  }

  const manifest =
    buildXPromotionPayoutManifest({
      intentId:
        String(state.intent.id),
      network:
        String(
          state.intent.network,
        ) as VeBetterNetwork,
      appId,
      x2EarnRewardsPoolAddress:
        poolAddress,
      operatorWallet:
        distributorAddress,
      inviteCode:
        String(
          state.intent.invite_code,
        ),
      recipientWallet:
        String(
          state.intent
            .recipient_wallet,
        ),
      amountWei:
        String(
          state.intent.amount_wei,
        ),
      publicProofId:
        String(
          state.intent
            .public_proof_id,
        ),
    });

  const { error } =
    await supabaseAdmin.rpc(
      'create_reward_x_promotion_payout_manifest_v1',
      {
        p_intent_id:
          String(state.intent.id),
        p_app_id:
          manifest.appId,
        p_x2earn_rewards_pool_address:
          manifest
            .x2EarnRewardsPoolAddress,
        p_operator_wallet:
          manifest.operatorWallet,
        p_manifest_hash:
          manifest.manifestHash,
        p_proof_text:
          manifest.proofText,
        p_proof_link:
          manifest.proofLink,
        p_description:
          manifest.description,
        p_clause:
          manifest.clause,
      },
    );

  if (error) {
    throw new Error(
      `X promotion manifest creation failed: ${error.message}`,
    );
  }
}

async function ensureCheckpoint(
  intentId: string,
  existing:
    Record<string, unknown> | null,
) {
  if (existing) {
    return;
  }

  const { nodeUrl } =
    getVeBetterNetworkConfig();
  const thor =
    ThorClient.at(nodeUrl);
  const bestBlock =
    await thor.blocks
      .getBestBlockCompressed();

  if (!bestBlock) {
    throw new Error(
      'X promotion payout checkpoint block is unavailable.',
    );
  }

  const blockId =
    String(bestBlock.id)
      .toLowerCase();
  const blockNumber =
    Number(bestBlock.number);
  const blockTimestamp =
    Number(bestBlock.timestamp);

  if (
    !HEX_32_PATTERN.test(
      blockId,
    ) ||
    !Number.isSafeInteger(
      blockNumber,
    ) ||
    !Number.isSafeInteger(
      blockTimestamp,
    )
  ) {
    throw new Error(
      'X promotion payout checkpoint block is invalid.',
    );
  }

  const { error } =
    await supabaseAdmin.rpc(
      'create_reward_x_promotion_payout_checkpoint_v1',
      {
        p_intent_id:
          intentId,
        p_block_id:
          blockId,
        p_block_number:
          blockNumber,
        p_block_timestamp:
          blockTimestamp,
      },
    );

  if (error) {
    throw new Error(
      `X promotion checkpoint creation failed: ${error.message}`,
    );
  }
}

async function signAndJournal({
  manifest,
  intentId,
  distributorAddress,
  privateKeyHex,
  network,
}: {
  manifest: XPromotionPayoutManifest;
  intentId: string;
  distributorAddress: string;
  privateKeyHex: string;
  network: VeBetterNetwork;
}) {
  if (
    await coreRewardWorkPending(
      network,
    )
  ) {
    return null;
  }

  const [
    freshPool,
    outstandingLiability,
  ] = await Promise.all([
    readVeInviteRewardPoolStatus(),
    readOutstandingLiability(
      network,
      manifest.appId,
    ),
  ]);

  if (
    freshPool.appId
      .toLowerCase() !==
    manifest.appId.toLowerCase()
  ) {
    throw new Error(
      'X promotion payout resolved a different VeInvite app.',
    );
  }
  if (
    network === 'mainnet' &&
    !freshPool
      .mainnetFundedRewardsEnabled
  ) {
    throw new Error(
      'Mainnet funded rewards were disabled before X promotion signing.',
    );
  }
  if (
    freshPool
      .distributionPaused
  ) {
    throw new Error(
      'Reward distribution was paused before X promotion signing.',
    );
  }
  if (
    distributorAddress ===
    freshPool.appAdmin
  ) {
    throw new Error(
      'X promotion distributor must remain separate from the app admin.',
    );
  }
  if (
    !freshPool
      .rewardDistributors
      .includes(
        distributorAddress,
      )
  ) {
    throw new Error(
      'X promotion distributor is no longer registered.',
    );
  }

  const poolBalance =
    BigInt(
      freshPool
        .effectiveRewardPoolWei,
    );
  const amount =
    BigInt(
      manifest.amountWei,
    );

  if (
    poolBalance <
    outstandingLiability
  ) {
    throw new Error(
      'Reward pool no longer covers all outstanding liabilities before X promotion signing.',
    );
  }
  if (
    poolBalance < amount
  ) {
    throw new Error(
      'Reward pool cannot cover the X promotion payout.',
    );
  }

  const { nodeUrl } =
    getVeBetterNetworkConfig();
  const thor =
    ThorClient.at(nodeUrl);
  const clauses = [
    {
      to:
        manifest.clause.to,
      value:
        manifest.clause.value,
      data:
        manifest.clause.data,
    },
  ];
  const [
    gasResult,
    bestBlock,
  ] = await Promise.all([
    thor.gas.estimateGas(
      clauses,
      distributorAddress,
    ),
    thor.blocks
      .getBestBlockCompressed(),
  ]);

  if (!bestBlock) {
    throw new Error(
      'VeChain best block is unavailable before X promotion signing.',
    );
  }

  const estimatedGas =
    Number(
      gasResult.totalGas,
    );
  const blockGasLimit =
    Number(
      (
        bestBlock as unknown as {
          gasLimit?: unknown;
        }
      ).gasLimit,
    );

  if (
    !Number.isSafeInteger(
      estimatedGas,
    ) ||
    estimatedGas < 1 ||
    !Number.isSafeInteger(
      blockGasLimit,
    ) ||
    blockGasLimit < 1 ||
    estimatedGas >
      Math.floor(
        blockGasLimit * 0.8,
      )
  ) {
    throw new Error(
      'X promotion payout gas estimate is outside the conservative limit.',
    );
  }

  const txBody =
    await thor.transactions
      .buildTransactionBody(
        clauses,
        gasResult.totalGas,
      );
  const keyBytes =
    Hex.of(privateKeyHex).bytes;

  try {
    const signed =
      Transaction
        .of(txBody)
        .sign(keyBytes);
    const txId =
      signed.id
        .toString()
        .toLowerCase();
    const rawTxHex =
      Hex
        .of(
          signed.encoded,
        )
        .toString()
        .toLowerCase();

    if (
      !HEX_32_PATTERN.test(
        txId,
      ) ||
      !RAW_TX_PATTERN.test(
        rawTxHex,
      )
    ) {
      throw new Error(
        'X promotion signing produced invalid transaction data.',
      );
    }

    const { error } =
      await supabaseAdmin.rpc(
        'register_reward_x_promotion_signed_submission_v1',
        {
          p_intent_id:
            intentId,
          p_tx_id:
            txId,
          p_operator_wallet:
            distributorAddress,
          p_raw_tx_hex:
            rawTxHex,
        },
      );

    if (error) {
      throw new Error(
        `X promotion signed submission could not be journaled: ${error.message}`,
      );
    }

    return {
      txId,
      rawTxHex,
    };
  } finally {
    keyBytes.fill(0);
  }
}

function isNotFoundError(
  error: unknown,
) {
  const message =
    error instanceof Error
      ? error.message
          .toLowerCase()
      : String(error)
          .toLowerCase();

  return (
    message.includes('404') ||
    message.includes(
      'not found',
    )
  );
}

async function broadcastExactSignedTransaction({
  txId,
  rawTxHex,
}: {
  txId: string;
  rawTxHex: string;
}) {
  const { nodeUrl } =
    getVeBetterNetworkConfig();
  const thor =
    ThorClient.at(nodeUrl);

  try {
    const existing =
      await thor.transactions
        .getTransaction(txId);

    if (existing) {
      return false;
    }
  } catch (error) {
    if (
      !isNotFoundError(error)
    ) {
      throw error;
    }
  }

  const signed =
    Transaction.decode(
      Hex.of(
        rawTxHex,
      ).bytes,
      true,
    );
  const sent =
    await thor.transactions
      .sendTransaction(
        signed,
      );

  if (
    String(sent.id)
      .toLowerCase() !==
    txId
  ) {
    throw new Error(
      'VeChain returned a different transaction id for the X promotion payout.',
    );
  }

  return true;
}

async function finalizeIfPossible({
  state,
  manifest,
}: {
  state: IntentState;
  manifest: XPromotionPayoutManifest;
}): Promise<
  'PAID' |
  'WAITING_FINALITY'
> {
  if (
    !state.checkpoint ||
    !state.signedTransaction ||
    !state.submission ||
    !state.manifest
  ) {
    throw new Error(
      'X promotion finality evidence is incomplete.',
    );
  }

  const txId =
    String(
      state.submission.tx_id ??
        '',
    )
      .trim()
      .toLowerCase();

  if (
    !HEX_32_PATTERN.test(
      txId,
    )
  ) {
    throw new Error(
      'X promotion submitted transaction id is invalid.',
    );
  }

  let verified;

  try {
    verified =
      await verifyFinalizedXPromotionTransactionOnChain(
        {
          txId,
          manifest,
          manifestCreatedAt:
            String(
              state.manifest
                .created_at,
            ),
        },
      );
  } catch (error) {
    if (
      error instanceof
        RewardTransactionVerificationError &&
      (
        error.code ===
          'TX_NOT_FOUND' ||
        error.code ===
          'TX_RECEIPT_NOT_FOUND' ||
        error.code ===
          'TX_NOT_FINALIZED'
      )
    ) {
      return 'WAITING_FINALITY';
    }

    throw error;
  }

  const checkpointBlock =
    Number(
      state.checkpoint
        .block_number,
    );

  if (
    !Number.isSafeInteger(
      checkpointBlock,
    ) ||
    verified.blockNumber <=
      checkpointBlock
  ) {
    throw new Error(
      'X promotion payout transaction did not occur after its immutable checkpoint.',
    );
  }

  const { error } =
    await supabaseAdmin.rpc(
      'finalize_reward_x_promotion_payout_v1',
      {
        p_intent_id:
          String(
            state.intent.id,
          ),
        p_tx_id:
          verified.txId,
        p_tx_origin:
          verified.txOrigin,
        p_block_id:
          verified.blockId,
        p_block_number:
          verified.blockNumber,
        p_block_timestamp:
          verified.blockTimestamp,
        p_finalized_head_id:
          verified.finalizedHeadId,
        p_finalized_head_number:
          verified.finalizedHeadNumber,
        p_clause_count:
          verified.clauseCount,
      },
    );

  if (error) {
    throw new Error(
      `X promotion payout settlement failed: ${error.message}`,
    );
  }

  return 'PAID';
}

/**
 * Pre-live executor foundation.
 *
 * This module is intentionally not wired to any cron or route yet. New signing
 * requires BOTH the dedicated worker env flag and DB LIVE to be enabled. The
 * current DB activation interlock still hard-blocks LIVE, so merging this file
 * cannot transfer B3TR.
 *
 * Recovery is different: once an exact transaction has already been signed and
 * journaled, a later run may rebroadcast/finalize that same immutable tx even if
 * new signing has been disabled. This mirrors the core reward recovery model and
 * prevents an operator switch or server restart from orphaning committed money.
 */
export async function runRewardXPromotionPayout():
Promise<RewardXPromotionPayoutResult> {
  const { network } =
    getVeBetterNetworkConfig();
  const existingIntentId =
    await findUnsettledIntentId(
      network,
    );

  if (existingIntentId) {
    const state =
      await loadIntentState(
        existingIntentId,
      );

    if (state.settlement) {
      return {
        status: 'PAID',
        network,
        intentId:
          existingIntentId,
        manifestId:
          state.manifest
            ? String(
                state.manifest.id,
              )
            : null,
        txId:
          String(
            state.settlement
              .tx_id ?? '',
          ) || null,
        transfersPerformed:
          false,
      };
    }

    if (
      Boolean(
        state.signedTransaction,
      ) !==
      Boolean(
        state.submission,
      )
    ) {
      return {
        status:
          'MANUAL_INTERVENTION_REQUIRED',
        network,
        intentId:
          existingIntentId,
        manifestId:
          state.manifest
            ? String(
                state.manifest.id,
              )
            : null,
        txId: null,
        reason:
          'Signed X promotion payout journal is partial.',
        transfersPerformed:
          false,
      };
    }

    if (
      state.signedTransaction &&
      state.submission
    ) {
      if (
        !state.manifest ||
        !state.checkpoint
      ) {
        return {
          status:
            'MANUAL_INTERVENTION_REQUIRED',
          network,
          intentId:
            existingIntentId,
          manifestId:
            state.manifest
              ? String(
                  state.manifest.id,
                )
              : null,
          txId:
            String(
              state.submission
                .tx_id ?? '',
            ) || null,
          reason:
            'Committed X promotion payout is missing immutable manifest or checkpoint evidence.',
          transfersPerformed:
            false,
        };
      }

      const ownerToken =
        randomUUID();
      const acquired =
        await acquireSharedPayoutLock(
          network,
          ownerToken,
        );

      if (!acquired) {
        return {
          status: 'LOCKED',
          network,
          intentId:
            existingIntentId,
          manifestId:
            String(
              state.manifest.id,
            ),
          txId:
            String(
              state.submission
                .tx_id ?? '',
            ) || null,
          transfersPerformed:
            false,
        };
      }

      try {
        const refreshed =
          await loadIntentState(
            existingIntentId,
          );
        if (
          refreshed.settlement
        ) {
          return {
            status: 'PAID',
            network,
            intentId:
              existingIntentId,
            manifestId:
              refreshed.manifest
                ? String(
                    refreshed
                      .manifest.id,
                  )
                : null,
            txId:
              String(
                refreshed
                  .settlement
                  .tx_id ?? '',
              ) || null,
            transfersPerformed:
              false,
          };
        }

        if (
          !refreshed
            .signedTransaction ||
          !refreshed
            .submission ||
          !refreshed
            .manifest ||
          !refreshed
            .checkpoint
        ) {
          return {
            status:
              'MANUAL_INTERVENTION_REQUIRED',
            network,
            intentId:
              existingIntentId,
            manifestId:
              refreshed.manifest
                ? String(
                    refreshed
                      .manifest.id,
                  )
                : null,
            txId: null,
            reason:
              'Committed X promotion payout evidence changed while locked.',
            transfersPerformed:
              false,
          };
        }

        const manifest =
          rebuildStoredManifest(
            refreshed,
          );
        const txId =
          String(
            refreshed
              .submission.tx_id,
          )
            .trim()
            .toLowerCase();
        const rawTxHex =
          String(
            refreshed
              .signedTransaction
              .raw_tx_hex,
          )
            .trim()
            .toLowerCase();

        if (
          !HEX_32_PATTERN.test(
            txId,
          ) ||
          !RAW_TX_PATTERN.test(
            rawTxHex,
          )
        ) {
          return {
            status:
              'MANUAL_INTERVENTION_REQUIRED',
            network,
            intentId:
              existingIntentId,
            manifestId:
              String(
                refreshed
                  .manifest.id,
              ),
            txId:
              txId || null,
            reason:
              'Committed X promotion payout transaction data is invalid.',
            transfersPerformed:
              false,
          };
        }

        const transferred =
          await broadcastExactSignedTransaction(
            {
              txId,
              rawTxHex,
            },
          );
        const finalState =
          await finalizeIfPossible({
            state: refreshed,
            manifest,
          });

        return {
          status:
            finalState,
          network,
          intentId:
            existingIntentId,
          manifestId:
            String(
              refreshed
                .manifest.id,
            ),
          txId,
          transfersPerformed:
            transferred,
        };
      } finally {
        await releaseSharedPayoutLock(
          network,
          ownerToken,
        );
      }
    }
  }

  const runtime =
    await readRuntimeGate();
  const identity =
    readDistributorIdentity();

  if (
    !runtime.liveEnabled ||
    !runtime.liveStartedAt
  ) {
    return {
      status: 'DISABLED',
      network,
      intentId:
        existingIntentId,
      manifestId: null,
      txId: null,
      reason:
        'X promotion LIVE is disabled.',
      transfersPerformed:
        false,
    };
  }

  if (
    !identity
      .automaticRewardsEnabled ||
    !identity.workerEnabled
  ) {
    return {
      status: 'DISABLED',
      network,
      intentId:
        existingIntentId,
      manifestId: null,
      txId: null,
      reason:
        'X promotion payout worker is not enabled.',
      transfersPerformed:
        false,
    };
  }

  if (
    !identity
      .expectedAddress ||
    !identity
      .privateKeyHex
  ) {
    return {
      status:
        'NOT_CONFIGURED',
      network,
      intentId:
        existingIntentId,
      manifestId: null,
      txId: null,
      reason:
        'X promotion payout credentials are incomplete.',
      transfersPerformed:
        false,
    };
  }

  const ownerToken =
    randomUUID();
  const acquired =
    await acquireSharedPayoutLock(
      network,
      ownerToken,
    );

  if (!acquired) {
    return {
      status: 'LOCKED',
      network,
      intentId:
        existingIntentId,
      manifestId: null,
      txId: null,
      transfersPerformed:
        false,
    };
  }

  try {
    if (
      await coreRewardWorkPending(
        network,
      )
    ) {
      return {
        status: 'IDLE',
        network,
        intentId:
          existingIntentId,
        manifestId: null,
        txId: null,
        reason:
          'Core referral reward payout has priority.',
        transfersPerformed:
          false,
      };
    }

    const pool =
      await readVeInviteRewardPoolStatus();
    const distributorAddress =
      identity.expectedAddress;

    if (
      network === 'mainnet' &&
      !pool
        .mainnetFundedRewardsEnabled
    ) {
      return {
        status: 'DISABLED',
        network,
        intentId:
          existingIntentId,
        manifestId: null,
        txId: null,
        reason:
          'Mainnet funded rewards are disabled.',
        transfersPerformed:
          false,
      };
    }
    if (
      pool
        .distributionPaused
    ) {
      return {
        status: 'DISABLED',
        network,
        intentId:
          existingIntentId,
        manifestId: null,
        txId: null,
        reason:
          'Reward distribution is paused.',
        transfersPerformed:
          false,
      };
    }
    if (
      distributorAddress ===
      pool.appAdmin
    ) {
      throw new Error(
        'X promotion distributor must be separate from the VeInvite app admin.',
      );
    }
    if (
      !pool
        .rewardDistributors
        .includes(
          distributorAddress,
        )
    ) {
      return {
        status:
          'NOT_REGISTERED',
        network,
        intentId:
          existingIntentId,
        manifestId: null,
        txId: null,
        reason:
          'Configured reward distributor is not registered on-chain.',
        transfersPerformed:
          false,
      };
    }

    let intentId =
      existingIntentId;

    if (!intentId) {
      const verificationId =
        await findFinalVerificationId(
          network,
        );

      if (!verificationId) {
        return {
          status: 'IDLE',
          network,
          intentId: null,
          manifestId: null,
          txId: null,
          transfersPerformed:
            false,
        };
      }

      intentId =
        await createIntent(
          verificationId,
        );
    }

    let state =
      await loadIntentState(
        intentId,
      );

    await ensureManifest({
      state,
      distributorAddress,
      poolAddress:
        pool
          .x2EarnRewardsPoolAddress,
      appId:
        pool.appId,
    });

    state =
      await loadIntentState(
        intentId,
      );

    if (!state.manifest) {
      throw new Error(
        'X promotion manifest could not be reloaded.',
      );
    }

    await ensureCheckpoint(
      intentId,
      state.checkpoint,
    );

    state =
      await loadIntentState(
        intentId,
      );

    if (
      !state.manifest ||
      !state.checkpoint
    ) {
      throw new Error(
        'X promotion payout preparation evidence is incomplete.',
      );
    }

    const manifest =
      rebuildStoredManifest(
        state,
      );

    const signed =
      await signAndJournal({
        manifest,
        intentId,
        distributorAddress,
        privateKeyHex:
          identity
            .privateKeyHex,
        network,
      });

    if (!signed) {
      return {
        status: 'PREPARED',
        network,
        intentId,
        manifestId:
          String(
            state.manifest.id,
          ),
        txId: null,
        reason:
          'Core referral reward appeared before X promotion signing.',
        transfersPerformed:
          false,
      };
    }

    const transferred =
      await broadcastExactSignedTransaction(
        signed,
      );

    return {
      status: 'SUBMITTED',
      network,
      intentId,
      manifestId:
        String(
          state.manifest.id,
        ),
      txId:
        signed.txId,
      transfersPerformed:
        transferred,
    };
  } finally {
    await releaseSharedPayoutLock(
      network,
      ownerToken,
    );
  }
}
