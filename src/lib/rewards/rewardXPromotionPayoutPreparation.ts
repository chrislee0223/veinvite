import 'server-only';

import { randomUUID } from 'node:crypto';

import { ThorClient } from '@vechain/sdk-network';

import {
  readAutomaticRewardDistributorReadiness,
} from '@/lib/rewards/automaticRewardPayout';
import {
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  buildXPromotionPayoutManifest,
} from '@/lib/rewards/rewardXPromotionPayoutManifest';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const PREPARATION_LOCK_SECONDS = 60;
const CANDIDATE_LIMIT = 25;

export type XPromotionPayoutPreparationStatus =
  | 'DISABLED'
  | 'NOT_CONFIGURED'
  | 'NOT_REGISTERED'
  | 'CORE_REWARD_PENDING'
  | 'LOCKED'
  | 'IDLE'
  | 'PREPARED';

export type XPromotionPayoutPreparationResult = {
  status: XPromotionPayoutPreparationStatus;
  network: VeBetterNetwork;
  distributorAddress: string | null;
  verificationId: string | null;
  intentId: string | null;
  manifestId: string | null;
  checkpointBlock: number | null;
  reason?: string;
  transfersPerformed: false;
};

function positiveId(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '');

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

async function readLiveGate(): Promise<{
  enabled: boolean;
  startedAt: string | null;
}> {
  const result = await supabaseAdmin
    .from('reward_runtime_config')
    .select(
      'reward_x_promotion_enabled,reward_x_promotion_live_started_at',
    )
    .eq('id', 1)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `X promotion runtime config could not be loaded: ${result.error.message}`,
    );
  }

  if (!result.data) {
    throw new Error(
      'X promotion runtime config is missing.',
    );
  }

  return {
    enabled:
      result.data.reward_x_promotion_enabled === true,
    startedAt:
      result.data.reward_x_promotion_live_started_at
        ? String(
            result.data.reward_x_promotion_live_started_at,
          )
        : null,
  };
}

async function hasCoreRewardPriority(
  network: VeBetterNetwork,
): Promise<boolean> {
  const [roundResult, queueResult] =
    await Promise.all([
      supabaseAdmin
        .from('reward_rounds')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('network', network)
        .in('status', ['CREATED', 'PAYING'])
        .is('broadcast_confirmed_at', null),
      supabaseAdmin
        .from('reward_queue_entries')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('network', network)
        .eq('status', 'QUEUED')
        .is('assigned_round_id', null),
    ]);

  if (roundResult.error) {
    throw new Error(
      `Core reward round priority could not be checked: ${roundResult.error.message}`,
    );
  }

  if (queueResult.error) {
    throw new Error(
      `Core reward queue priority could not be checked: ${queueResult.error.message}`,
    );
  }

  return (
    (roundResult.count ?? 0) > 0 ||
    (queueResult.count ?? 0) > 0
  );
}

async function acquireSharedPayoutLock(
  network: VeBetterNetwork,
  ownerToken: string,
): Promise<boolean> {
  const result = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name:
        `automatic_reward_payout:${network}`,
      p_owner_token: ownerToken,
      p_lease_seconds:
        PREPARATION_LOCK_SECONDS,
    },
  );

  if (result.error) {
    throw new Error(
      `Shared reward payout lock could not be acquired: ${result.error.message}`,
    );
  }

  return result.data === true;
}

async function releaseSharedPayoutLock(
  network: VeBetterNetwork,
  ownerToken: string,
) {
  const result = await supabaseAdmin.rpc(
    'release_operator_lock',
    {
      p_lock_name:
        `automatic_reward_payout:${network}`,
      p_owner_token: ownerToken,
    },
  );

  if (result.error) {
    console.error(
      'Shared reward payout lock could not be released:',
      result.error,
    );
  }
}

async function findNextFinalVerification(
  network: VeBetterNetwork,
): Promise<Record<string, unknown> | null> {
  const result = await supabaseAdmin
    .from('reward_x_promotion_post_verifications')
    .select(
      'id,obligation_id,invite_code,network,recipient_wallet,x_post_id,x_author_id,final_verified_at',
    )
    .eq('network', network)
    .eq(
      'verification_state',
      'FINAL_VERIFIED',
    )
    .not('final_verified_at', 'is', null)
    .is('invalidated_at', null)
    .order('final_verified_at', {
      ascending: true,
    })
    .order('id', {
      ascending: true,
    })
    .limit(CANDIDATE_LIMIT);

  if (result.error) {
    throw new Error(
      `X promotion final verification candidates could not be loaded: ${result.error.message}`,
    );
  }

  for (const raw of result.data ?? []) {
    const verification =
      raw as Record<string, unknown>;
    const verificationId =
      positiveId(
        verification.id,
        'verification id',
      );
    const obligationId =
      positiveId(
        verification.obligation_id,
        'obligation id',
      );

    const [
      intentResult,
      obligationResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('reward_x_promotion_payout_intents')
        .select('id')
        .eq(
          'verification_id',
          verificationId,
        )
        .maybeSingle(),
      supabaseAdmin
        .from('reward_x_promotion_obligations')
        .select(
          'id,financial_state,held_at,released_at,paid_at',
        )
        .eq('id', obligationId)
        .maybeSingle(),
    ]);

    if (intentResult.error) {
      throw new Error(
        `X promotion payout intent state could not be checked: ${intentResult.error.message}`,
      );
    }

    if (obligationResult.error) {
      throw new Error(
        `X promotion obligation state could not be checked: ${obligationResult.error.message}`,
      );
    }

    if (intentResult.data) {
      continue;
    }

    const obligation =
      obligationResult.data;

    if (
      !obligation ||
      obligation.financial_state !== 'HELD' ||
      !obligation.held_at ||
      obligation.released_at ||
      obligation.paid_at
    ) {
      continue;
    }

    return verification;
  }

  return null;
}

async function loadPayoutIntent(
  intentId: string,
): Promise<Record<string, unknown>> {
  const result = await supabaseAdmin
    .from('reward_x_promotion_payout_intents')
    .select(
      'id,verification_id,invite_code,network,recipient_wallet,amount_wei,public_proof_id,created_at',
    )
    .eq('id', intentId)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `X promotion payout intent could not be loaded: ${result.error.message}`,
    );
  }

  if (!result.data) {
    throw new Error(
      'X promotion payout intent is missing after creation.',
    );
  }

  return result.data as Record<string, unknown>;
}

async function ensureManifest({
  intent,
  distributorAddress,
  poolAddress,
}: {
  intent: Record<string, unknown>;
  distributorAddress: string;
  poolAddress: string;
}): Promise<{
  manifestId: string;
}> {
  const intentId =
    positiveId(intent.id, 'intent id');

  const existing = await supabaseAdmin
    .from('reward_x_promotion_payout_manifests')
    .select(
      'id,manifest_hash,operator_wallet',
    )
    .eq('intent_id', intentId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(
      `X promotion payout manifest state could not be checked: ${existing.error.message}`,
    );
  }

  if (existing.data) {
    if (
      String(
        existing.data.operator_wallet,
      ).toLowerCase() !==
      distributorAddress
    ) {
      throw new Error(
        'Existing X promotion payout manifest belongs to a different operator wallet.',
      );
    }

    return {
      manifestId:
        positiveId(
          existing.data.id,
          'manifest id',
        ),
    };
  }

  const manifest =
    buildXPromotionPayoutManifest({
      intentId,
      network:
        String(intent.network) as VeBetterNetwork,
      appId:
        '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
      x2EarnRewardsPoolAddress:
        poolAddress,
      operatorWallet:
        distributorAddress,
      inviteCode:
        String(intent.invite_code),
      recipientWallet:
        String(intent.recipient_wallet),
      amountWei:
        String(intent.amount_wei),
      publicProofId:
        String(intent.public_proof_id),
    });

  const result = await supabaseAdmin.rpc(
    'create_reward_x_promotion_payout_manifest_v1',
    {
      p_intent_id: intentId,
      p_app_id: manifest.appId,
      p_x2earn_rewards_pool_address:
        manifest.x2EarnRewardsPoolAddress,
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

  if (result.error) {
    throw new Error(
      `X promotion payout manifest could not be created: ${result.error.message}`,
    );
  }

  const payload =
    result.data as Record<string, unknown> | null;

  if (!payload) {
    throw new Error(
      'X promotion payout manifest creation returned no result.',
    );
  }

  return {
    manifestId:
      positiveId(
        payload.manifestId,
        'manifest id',
      ),
  };
}

async function ensureCheckpoint(
  intentId: string,
): Promise<number> {
  const existing = await supabaseAdmin
    .from('reward_x_promotion_payout_checkpoints')
    .select(
      'block_number',
    )
    .eq('intent_id', intentId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(
      `X promotion payout checkpoint state could not be checked: ${existing.error.message}`,
    );
  }

  if (existing.data) {
    const blockNumber =
      Number(existing.data.block_number);

    if (
      !Number.isSafeInteger(blockNumber) ||
      blockNumber < 0
    ) {
      throw new Error(
        'Existing X promotion payout checkpoint block is invalid.',
      );
    }

    return blockNumber;
  }

  const { nodeUrl } =
    getVeBetterNetworkConfig();
  const thor =
    ThorClient.at(nodeUrl);
  const bestBlock =
    await thor.blocks.getBestBlockCompressed();

  if (!bestBlock) {
    throw new Error(
      'VeChain best block could not be loaded for X promotion payout checkpoint.',
    );
  }

  const blockId =
    String(bestBlock.id).toLowerCase();
  const blockNumber =
    Number(bestBlock.number);
  const blockTimestamp =
    Number(bestBlock.timestamp);

  if (
    !/^0x[0-9a-f]{64}$/u.test(blockId) ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0 ||
    !Number.isSafeInteger(blockTimestamp) ||
    blockTimestamp < 0
  ) {
    throw new Error(
      'VeChain X promotion payout checkpoint metadata is invalid.',
    );
  }

  const result = await supabaseAdmin.rpc(
    'create_reward_x_promotion_payout_checkpoint_v1',
    {
      p_intent_id: intentId,
      p_block_id: blockId,
      p_block_number: blockNumber,
      p_block_timestamp:
        blockTimestamp,
    },
  );

  if (result.error) {
    throw new Error(
      `X promotion payout checkpoint could not be created: ${result.error.message}`,
    );
  }

  return blockNumber;
}

/**
 * Prepares at most one fully verified X Promotion payout up to the immutable
 * manifest/checkpoint boundary.
 *
 * This function deliberately has no signing or broadcast capability. It does
 * not read private key material, construct a VeChain transaction body, or call
 * sendTransaction. The separate live payout executor can only be added after
 * this preparation path is independently reviewed.
 */
export async function runXPromotionPayoutPreparation():
Promise<XPromotionPayoutPreparationResult> {
  const { network } =
    getVeBetterNetworkConfig();
  const liveGate =
    await readLiveGate();

  if (
    !liveGate.enabled ||
    !liveGate.startedAt
  ) {
    return {
      status: 'DISABLED',
      network,
      distributorAddress: null,
      verificationId: null,
      intentId: null,
      manifestId: null,
      checkpointBlock: null,
      reason:
        'X Promotion LIVE payout preparation is disabled.',
      transfersPerformed: false,
    };
  }

  const readiness =
    readAutomaticRewardDistributorReadiness();

  if (
    !readiness.enabled ||
    !readiness.configured ||
    !readiness.distributorAddress
  ) {
    return {
      status: 'NOT_CONFIGURED',
      network,
      distributorAddress:
        readiness.distributorAddress,
      verificationId: null,
      intentId: null,
      manifestId: null,
      checkpointBlock: null,
      reason:
        'Automatic reward distributor credentials are not ready.',
      transfersPerformed: false,
    };
  }

  const distributorAddress =
    readiness.distributorAddress;
  const pool =
    await readVeInviteRewardPoolStatus();

  if (
    network === 'mainnet' &&
    !pool.mainnetFundedRewardsEnabled
  ) {
    return {
      status: 'DISABLED',
      network,
      distributorAddress,
      verificationId: null,
      intentId: null,
      manifestId: null,
      checkpointBlock: null,
      reason:
        'Mainnet funded rewards are disabled.',
      transfersPerformed: false,
    };
  }

  if (pool.distributionPaused) {
    return {
      status: 'DISABLED',
      network,
      distributorAddress,
      verificationId: null,
      intentId: null,
      manifestId: null,
      checkpointBlock: null,
      reason:
        'Reward distribution is paused.',
      transfersPerformed: false,
    };
  }

  if (
    distributorAddress ===
    pool.appAdmin
  ) {
    throw new Error(
      'X promotion payout distributor must be separate from the VeInvite app admin wallet.',
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
      verificationId: null,
      intentId: null,
      manifestId: null,
      checkpointBlock: null,
      reason:
        'Automatic reward distributor is not registered on-chain.',
      transfersPerformed: false,
    };
  }

  if (
    await hasCoreRewardPriority(network)
  ) {
    return {
      status: 'CORE_REWARD_PENDING',
      network,
      distributorAddress,
      verificationId: null,
      intentId: null,
      manifestId: null,
      checkpointBlock: null,
      reason:
        'Core referral reward payout has priority.',
      transfersPerformed: false,
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
      distributorAddress,
      verificationId: null,
      intentId: null,
      manifestId: null,
      checkpointBlock: null,
      reason:
        'The shared reward payout signer lock is busy.',
      transfersPerformed: false,
    };
  }

  try {
    if (
      await hasCoreRewardPriority(network)
    ) {
      return {
        status: 'CORE_REWARD_PENDING',
        network,
        distributorAddress,
        verificationId: null,
        intentId: null,
        manifestId: null,
        checkpointBlock: null,
        reason:
          'Core referral reward payout became pending before X promotion preparation.',
        transfersPerformed: false,
      };
    }

    const verification =
      await findNextFinalVerification(
        network,
      );

    if (!verification) {
      return {
        status: 'IDLE',
        network,
        distributorAddress,
        verificationId: null,
        intentId: null,
        manifestId: null,
        checkpointBlock: null,
        transfersPerformed: false,
      };
    }

    const verificationId =
      positiveId(
        verification.id,
        'verification id',
      );

    const intentResult =
      await supabaseAdmin.rpc(
        'create_reward_x_promotion_payout_intent_v1',
        {
          p_verification_id:
            verificationId,
        },
      );

    if (intentResult.error) {
      throw new Error(
        `X promotion payout intent could not be created: ${intentResult.error.message}`,
      );
    }

    const intentPayload =
      intentResult.data as
        | Record<string, unknown>
        | null;

    if (!intentPayload) {
      throw new Error(
        'X promotion payout intent creation returned no result.',
      );
    }

    const intentId =
      positiveId(
        intentPayload.intentId,
        'intent id',
      );
    const intent =
      await loadPayoutIntent(intentId);
    const manifest =
      await ensureManifest({
        intent,
        distributorAddress,
        poolAddress:
          pool.x2EarnRewardsPoolAddress,
      });
    const checkpointBlock =
      await ensureCheckpoint(intentId);

    return {
      status: 'PREPARED',
      network,
      distributorAddress,
      verificationId,
      intentId,
      manifestId:
        manifest.manifestId,
      checkpointBlock,
      transfersPerformed: false,
    };
  } finally {
    await releaseSharedPayoutLock(
      network,
      ownerToken,
    );
  }
}
