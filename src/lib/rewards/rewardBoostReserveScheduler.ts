import 'server-only';

import {
  markCronJobFailed,
  markCronJobSucceeded,
  tryClaimCronJob,
} from '@/lib/monitoring/cronHeartbeat';
import {
  syncVeInviteAllocationReceipts,
} from '@/lib/rewards/allocationAccounting';
import {
  runRewardBoostReserveRebalance,
  type RewardBoostReserveExecutionResult,
} from '@/lib/rewards/rewardBoostReserveExecution';
import {
  readRewardRuntimeSafety,
} from '@/lib/rewards/runtimeSafety';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

export const REWARD_BOOST_REBALANCE_INTERVAL_SECONDS =
  30 * 60;

const REWARD_BOOST_REBALANCE_JOB =
  'vote-reconcile:reward-boost-reserve';
const REWARD_BOOST_REBALANCE_LEASE_SECONDS = 180;

export type ScheduledRewardBoostReserveResult = {
  claimed: boolean;
  allocationSync: {
    network: string;
    insertedCount: number;
    latestVeBetterRoundId: string | null;
  } | null;
  reserve: RewardBoostReserveExecutionResult | null;
  skippedReason: 'RUNTIME_CLOSED' | null;
  error: string | null;
};

export async function runScheduledRewardBoostReserveRebalance():
Promise<ScheduledRewardBoostReserveResult> {
  let claimed = false;

  try {
    claimed =
      await tryClaimCronJob(
        REWARD_BOOST_REBALANCE_JOB,
        REWARD_BOOST_REBALANCE_INTERVAL_SECONDS,
        REWARD_BOOST_REBALANCE_LEASE_SECONDS,
      );
  } catch (error) {
    console.error(
      'Reward boost reserve cadence claim failed:',
      error,
    );

    return {
      claimed: false,
      allocationSync: null,
      reserve: null,
      skippedReason: null,
      error:
        'REWARD_BOOST_RESERVE_CADENCE_CLAIM_FAILED',
    };
  }

  if (!claimed) {
    return {
      claimed: false,
      allocationSync: null,
      reserve: null,
      skippedReason: null,
      error: null,
    };
  }

  try {
    const runtime =
      await readRewardRuntimeSafety();
    const { network } =
      getVeBetterNetworkConfig();

    if (
      runtime.emergencyRewardsPaused ||
      (
        network === 'mainnet' &&
        !runtime.mainnetFundedRewardsEnabled
      )
    ) {
      await markCronJobSucceeded(
        REWARD_BOOST_REBALANCE_JOB,
      );

      return {
        claimed: true,
        allocationSync: null,
        reserve: null,
        skippedReason: 'RUNTIME_CLOSED',
        error: null,
      };
    }

    // Finalized AllocationRewardsClaimed evidence defines the reward cohort.
    // Sync it immediately before rebalancing so a newly opened VeBetterDAO
    // round is protected/boosted without waiting for the daily cron.
    const allocation =
      await syncVeInviteAllocationReceipts();
    const reserve =
      await runRewardBoostReserveRebalance();

    await markCronJobSucceeded(
      REWARD_BOOST_REBALANCE_JOB,
    );

    return {
      claimed: true,
      allocationSync: {
        network: allocation.network,
        insertedCount: allocation.insertedCount,
        latestVeBetterRoundId:
          allocation.latestReceipt
            ?.vebetter_round_id ?? null,
      },
      reserve,
      skippedReason: null,
      error: null,
    };
  } catch (error) {
    console.error(
      'Reward boost reserve scheduled rebalance failed:',
      error,
    );

    try {
      await markCronJobFailed(
        REWARD_BOOST_REBALANCE_JOB,
        error,
      );
    } catch (heartbeatError) {
      console.error(
        'Reward boost reserve heartbeat failure:',
        heartbeatError,
      );
    }

    return {
      claimed: true,
      allocationSync: null,
      reserve: null,
      skippedReason: null,
      error:
        'REWARD_BOOST_RESERVE_REBALANCE_FAILED',
    };
  }
}
