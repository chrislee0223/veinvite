import 'server-only';

import { randomUUID } from 'node:crypto';

import { readVeInviteRewardPoolStatus } from '@/lib/rewards/onchainPool';
import { readRewardRuntimeSafety } from '@/lib/rewards/runtimeSafety';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

const ACTIVE_REWARD_ROUND_ERROR =
  'Finish the current reward round before preparing another one';
const FAST_PATH_ALGORITHM_VERSION =
  'claim-reserved-fast-path-v1';
const PAYOUT_LOCK_SECONDS = 180;

type ClaimFastPathPreparation = {
  status:
    | 'PREPARED'
    | 'ACTIVE_ROUND'
    | 'LOCKED'
    | 'SAFETY_BLOCKED'
    | 'NO_CLAIMED_REWARDS';
  roundId: string | null;
  reason: string;
};

type ClaimFastPathInput = {
  distributorAddress: string;
};

function positiveId(value: unknown, fieldName: string): string {
  const normalized = String(value ?? '');

  if (!/^\d+$/.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return BigInt(normalized).toString();
}

async function acquirePayoutLock(
  network: string,
  ownerToken: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name: `automatic_reward_payout:${network}`,
      p_owner_token: ownerToken,
      p_lease_seconds: PAYOUT_LOCK_SECONDS,
    },
  );

  if (error) {
    throw new Error(
      `Claim fast-path payout lock could not be acquired: ${error.message}`,
    );
  }

  return data === true;
}

async function releasePayoutLock(
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
      'Claim fast-path payout lock could not be released:',
      error,
    );
  }
}

/**
 * Prepares already-claimed, already-reserved rewards without re-running the
 * reservation sweep, allocation sync, Sybil refresh, or predictive-planning
 * application path. The database remains authoritative for the claimed cohort,
 * fixed reservation amount, cohort budget, and duplicate payout protection.
 *
 * The same runtime pause, funded-mainnet, distributor registration, and
 * admin-wallet separation gates used by the transfer worker are checked before
 * this function can create an ASSIGNED payout batch. This prevents a Claim made
 * while payouts are intentionally unavailable from being moved into processing.
 *
 * This function never transfers tokens. It only creates the immutable payout
 * round for durable QUEUED claims so the normal automatic payout worker can
 * move directly to manifest creation, signing, broadcast, and finalization.
 */
export async function prepareClaimedRewardFastPath({
  distributorAddress,
}: ClaimFastPathInput):
Promise<ClaimFastPathPreparation> {
  const { network } = getVeBetterNetworkConfig();
  const normalizedDistributor = distributorAddress
    .trim()
    .toLowerCase();
  const ownerToken = randomUUID();
  const acquired = await acquirePayoutLock(
    network,
    ownerToken,
  );

  if (!acquired) {
    return {
      status: 'LOCKED',
      roundId: null,
      reason: 'AUTOMATIC_PAYOUT_LOCKED',
    };
  }

  try {
    const [pool, runtime] = await Promise.all([
      readVeInviteRewardPoolStatus(),
      readRewardRuntimeSafety(),
    ]);

    if (
      network === 'mainnet' &&
      !runtime.mainnetFundedRewardsEnabled
    ) {
      return {
        status: 'SAFETY_BLOCKED',
        roundId: null,
        reason: 'MAINNET_FUNDED_REWARDS_DISABLED',
      };
    }

    if (
      runtime.emergencyRewardsPaused ||
      pool.distributionPaused
    ) {
      return {
        status: 'SAFETY_BLOCKED',
        roundId: null,
        reason: 'REWARD_DISTRIBUTION_PAUSED',
      };
    }

    if (normalizedDistributor === pool.appAdmin) {
      return {
        status: 'SAFETY_BLOCKED',
        roundId: null,
        reason: 'DISTRIBUTOR_ADMIN_CONFLICT',
      };
    }

    if (
      !pool.rewardDistributors.includes(
        normalizedDistributor,
      )
    ) {
      return {
        status: 'SAFETY_BLOCKED',
        roundId: null,
        reason: 'DISTRIBUTOR_NOT_REGISTERED',
      };
    }

    const { data, error } = await supabaseAdmin.rpc(
      'prepare_predictive_reward_batch',
      {
        p_network: network,
        p_app_id: pool.appId,
        p_pool_balance_wei: pool.effectiveRewardPoolWei,
        // The RPC resolves the authoritative next claimed cohort itself. These
        // compatibility fields are retained only for its legacy metadata bridge.
        p_allocation_receipt_id: null,
        p_expected_completions: 0,
        p_stress_completions: 1,
        p_reward_per_invite_wei: '0',
        p_algorithm_version: FAST_PATH_ALGORITHM_VERSION,
        p_pipeline_snapshot: {
          source: 'EXPLICIT_CLAIM_FAST_PATH',
          reservedOnly: true,
        },
      },
    );

    if (error) {
      if (error.message.includes(ACTIVE_REWARD_ROUND_ERROR)) {
        return {
          status: 'ACTIVE_ROUND',
          roundId: null,
          reason: 'ACTIVE_REWARD_ROUND',
        };
      }

      throw new Error(
        `Claim fast-path reward preparation failed: ${error.message}`,
      );
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(
        'Claim fast-path reward preparation returned malformed data.',
      );
    }

    const result = data as Record<string, unknown>;
    const rawRoundId = result.roundId;
    const reason = String(result.reason ?? 'UNKNOWN');

    if (rawRoundId === null || rawRoundId === undefined) {
      return {
        status: 'NO_CLAIMED_REWARDS',
        roundId: null,
        reason,
      };
    }

    return {
      status: 'PREPARED',
      roundId: positiveId(
        rawRoundId,
        'claim fast-path round id',
      ),
      reason,
    };
  } finally {
    await releasePayoutLock(
      network,
      ownerToken,
    );
  }
}
