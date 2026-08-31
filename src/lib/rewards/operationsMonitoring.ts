import 'server-only';

import { ThorClient } from '@vechain/sdk-network';

import {
  readAutomaticRewardDistributorReadiness,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import {
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  readPredictiveRewardPlanning,
} from '@/lib/rewards/predictivePlanning';
import {
  readRewardRuntimeSafety,
} from '@/lib/rewards/runtimeSafety';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const TOKEN_SCALE = 10n ** 18n;
const VTHO_WARNING_WEI = 500n * TOKEN_SCALE;
const VTHO_CRITICAL_WEI = 100n * TOKEN_SCALE;
const QUEUE_WARNING_MS = 15 * 60 * 1000;
const QUEUE_CRITICAL_MS = 60 * 60 * 1000;
const SIGNED_TX_WARNING_MS = 10 * 60 * 1000;
const SIGNED_TX_CRITICAL_MS = 30 * 60 * 1000;
const ACTIVE_ROUND_WARNING_MS = 30 * 60 * 1000;
const ACTIVE_ROUND_CRITICAL_MS = 2 * 60 * 60 * 1000;

export type RewardOperationsSeverity =
  | 'NORMAL'
  | 'WARNING'
  | 'CRITICAL';

export type RewardOperationsAlert = {
  code: string;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
};

type TimestampedRow = {
  created_at?: unknown;
  queued_at?: unknown;
  started_at?: unknown;
};

type SignedTransactionRow = {
  manifest_id?: unknown;
  round_id?: unknown;
  tx_id?: unknown;
  created_at?: unknown;
};

export type RewardOperationsHealth = {
  capturedAt: string;
  network: string;
  severity: RewardOperationsSeverity;
  operational: boolean;
  alerts: RewardOperationsAlert[];
  distributor: {
    address: string | null;
    automaticRewardsEnabled: boolean;
    configured: boolean;
    registered: boolean;
    vthoWei: string | null;
    gasStatus: 'READY' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
  };
  runtime: {
    funded: boolean;
    emergencyPaused: boolean;
    distributionPaused: boolean;
  };
  pool: {
    effectiveRewardPoolWei: string;
    rewardsPoolEnabled: boolean;
    expectedCompletions: number | null;
    stressCompletions: number | null;
    rewardPerInviteWei: string | null;
    maxImmediatelyPayableCount: string | null;
  };
  queue: {
    queuedCount: number;
    oldestQueuedAt: string | null;
    oldestQueuedAgeSeconds: number | null;
  };
  payoutPipeline: {
    activeRoundId: string | null;
    activeRoundStatus: string | null;
    activeRoundAgeSeconds: number | null;
    oldestUnsettledSignedTxId: string | null;
    oldestUnsettledSignedTxAgeSeconds: number | null;
  };
};

function timestamp(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value))
  ) {
    return null;
  }

  return value;
}

function ageMs(value: string | null, nowMs: number): number | null {
  if (!value) {
    return null;
  }

  return Math.max(0, nowMs - Date.parse(value));
}

function seconds(value: number | null): number | null {
  return value === null
    ? null
    : Math.floor(value / 1000);
}

function addAlert(
  alerts: RewardOperationsAlert[],
  code: string,
  severity: 'WARNING' | 'CRITICAL',
  message: string,
) {
  alerts.push({ code, severity, message });
}

function finalSeverity(
  alerts: RewardOperationsAlert[],
): RewardOperationsSeverity {
  if (alerts.some((alert) => alert.severity === 'CRITICAL')) {
    return 'CRITICAL';
  }

  if (alerts.length > 0) {
    return 'WARNING';
  }

  return 'NORMAL';
}

function stringId(value: unknown): string | null {
  const normalized = String(value ?? '');
  return /^\d+$/.test(normalized)
    ? BigInt(normalized).toString()
    : null;
}

export async function readRewardOperationsHealth():
Promise<RewardOperationsHealth> {
  const now = new Date();
  const nowMs = now.getTime();
  const alerts: RewardOperationsAlert[] = [];
  const networkConfig = getVeBetterNetworkConfig();

  const [
    automaticRewards,
    pool,
    runtime,
  ] = await Promise.all([
    Promise.resolve(
      readAutomaticRewardDistributorReadiness(),
    ),
    readVeInviteRewardPoolStatus(),
    readRewardRuntimeSafety(),
  ]);

  const distributorAddress =
    automaticRewards.distributorAddress;
  const distributorRegistered = Boolean(
    distributorAddress &&
    pool.rewardDistributors.includes(
      distributorAddress,
    ),
  );

  if (!automaticRewards.enabled) {
    addAlert(
      alerts,
      'AUTOMATIC_REWARDS_DISABLED',
      'CRITICAL',
      'Automatic reward execution is disabled.',
    );
  }

  if (!automaticRewards.configured) {
    addAlert(
      alerts,
      'AUTOMATIC_REWARDS_NOT_CONFIGURED',
      'CRITICAL',
      'The automatic Reward Distributor signer is not fully configured.',
    );
  }

  if (!distributorRegistered) {
    addAlert(
      alerts,
      'REWARD_DISTRIBUTOR_NOT_REGISTERED',
      'CRITICAL',
      'The configured Reward Distributor is not registered on-chain for VeInvite.',
    );
  }

  if (
    networkConfig.network === 'mainnet' &&
    !runtime.mainnetFundedRewardsEnabled
  ) {
    addAlert(
      alerts,
      'FUNDED_REWARDS_GATE_DISABLED',
      'CRITICAL',
      'Mainnet funded rewards are disabled by the VeInvite runtime safety gate.',
    );
  }

  if (runtime.emergencyRewardsPaused) {
    addAlert(
      alerts,
      'EMERGENCY_REWARDS_PAUSED',
      'CRITICAL',
      'VeInvite emergency reward pause is active.',
    );
  }

  if (pool.onChainDistributionPaused) {
    addAlert(
      alerts,
      'ONCHAIN_DISTRIBUTION_PAUSED',
      'CRITICAL',
      'VeBetterDAO reward distribution is paused on-chain for VeInvite.',
    );
  }

  let vthoWei: string | null = null;
  let gasStatus: RewardOperationsHealth['distributor']['gasStatus'] =
    'UNKNOWN';

  if (distributorAddress) {
    const thor = ThorClient.at(networkConfig.nodeUrl);
    const account =
      await thor.accounts.getAccount(
        distributorAddress,
      );
    const energyWei = BigInt(account.energy);
    vthoWei = energyWei.toString();

    if (energyWei < VTHO_CRITICAL_WEI) {
      gasStatus = 'CRITICAL';
      addAlert(
        alerts,
        'REWARD_DISTRIBUTOR_VTHO_CRITICAL',
        'CRITICAL',
        'Reward Distributor VTHO is below the 100 VTHO critical reserve.',
      );
    } else if (energyWei < VTHO_WARNING_WEI) {
      gasStatus = 'LOW';
      addAlert(
        alerts,
        'REWARD_DISTRIBUTOR_VTHO_LOW',
        'WARNING',
        'Reward Distributor VTHO is below the 500 VTHO operating reserve.',
      );
    } else {
      gasStatus = 'READY';
    }
  }

  const [
    queueResult,
    activeRoundResult,
    signedResult,
    planning,
  ] = await Promise.all([
    supabaseAdmin
      .from('reward_queue_entries')
      .select('id, queued_at', {
        count: 'exact',
      })
      .eq('network', pool.network)
      .eq('status', 'QUEUED')
      .order('queued_at', {
        ascending: true,
      })
      .limit(1),
    supabaseAdmin
      .from('reward_rounds')
      .select(
        'id, status, created_at, started_at',
      )
      .eq('network', pool.network)
      .eq('app_id', pool.appId)
      .in('status', ['CREATED', 'PAYING'])
      .order('id', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_payout_signed_transactions')
      .select(
        'manifest_id, round_id, tx_id, created_at',
      )
      .eq('network', pool.network)
      .order('created_at', {
        ascending: true,
      })
      .limit(50),
    readPredictiveRewardPlanning({
      network: pool.network,
      appId: pool.appId,
      observedPoolBalanceWei:
        pool.effectiveRewardPoolWei,
    }),
  ]);

  if (queueResult.error) {
    throw new Error(
      `Reward operations queue check failed: ${queueResult.error.message}`,
    );
  }

  if (activeRoundResult.error) {
    throw new Error(
      `Reward operations active-round check failed: ${activeRoundResult.error.message}`,
    );
  }

  if (signedResult.error) {
    throw new Error(
      `Reward operations signed-transaction check failed: ${signedResult.error.message}`,
    );
  }

  const queuedCount = queueResult.count ?? 0;
  const oldestQueueRow =
    (queueResult.data?.[0] ?? null) as
      | TimestampedRow
      | null;
  const oldestQueuedAt =
    timestamp(oldestQueueRow?.queued_at);
  const oldestQueuedAgeMs =
    ageMs(oldestQueuedAt, nowMs);

  if (
    queuedCount > 0 &&
    oldestQueuedAgeMs !== null
  ) {
    if (oldestQueuedAgeMs >= QUEUE_CRITICAL_MS) {
      addAlert(
        alerts,
        'REWARD_QUEUE_STALLED',
        'CRITICAL',
        'An eligible reward has remained queued for at least one hour.',
      );
    } else if (
      oldestQueuedAgeMs >= QUEUE_WARNING_MS
    ) {
      addAlert(
        alerts,
        'REWARD_QUEUE_DELAYED',
        'WARNING',
        'An eligible reward has remained queued for at least 15 minutes.',
      );
    }
  }

  const activeRound =
    activeRoundResult.data as
      | (TimestampedRow & {
          id?: unknown;
          status?: unknown;
        })
      | null;
  const activeRoundStartedAt =
    timestamp(activeRound?.started_at) ??
    timestamp(activeRound?.created_at);
  const activeRoundAgeMs =
    ageMs(activeRoundStartedAt, nowMs);

  if (activeRound && activeRoundAgeMs !== null) {
    if (
      activeRoundAgeMs >= ACTIVE_ROUND_CRITICAL_MS
    ) {
      addAlert(
        alerts,
        'REWARD_ROUND_STALLED',
        'CRITICAL',
        'An automatic reward round has remained open for at least two hours.',
      );
    } else if (
      activeRoundAgeMs >= ACTIVE_ROUND_WARNING_MS
    ) {
      addAlert(
        alerts,
        'REWARD_ROUND_DELAYED',
        'WARNING',
        'An automatic reward round has remained open for at least 30 minutes.',
      );
    }
  }

  const signedRows =
    (signedResult.data ?? []) as SignedTransactionRow[];
  let oldestUnsettledSignedTx:
    SignedTransactionRow | null = null;

  if (signedRows.length > 0) {
    const manifestIds = signedRows
      .map((row) => stringId(row.manifest_id))
      .filter((value): value is string =>
        Boolean(value),
      );

    if (manifestIds.length > 0) {
      const settlementResult =
        await supabaseAdmin
          .from(
            'reward_payout_transaction_settlements',
          )
          .select('manifest_id')
          .in('manifest_id', manifestIds);

      if (settlementResult.error) {
        throw new Error(
          `Reward operations settlement check failed: ${settlementResult.error.message}`,
        );
      }

      const settledManifestIds = new Set(
        (settlementResult.data ?? []).map(
          (row) => String(row.manifest_id),
        ),
      );

      oldestUnsettledSignedTx =
        signedRows.find((row) => {
          const manifestId = stringId(
            row.manifest_id,
          );
          return Boolean(
            manifestId &&
            !settledManifestIds.has(manifestId),
          );
        }) ?? null;
    }
  }

  const oldestUnsettledCreatedAt =
    timestamp(
      oldestUnsettledSignedTx?.created_at,
    );
  const oldestUnsettledAgeMs =
    ageMs(
      oldestUnsettledCreatedAt,
      nowMs,
    );

  if (oldestUnsettledAgeMs !== null) {
    if (
      oldestUnsettledAgeMs >=
      SIGNED_TX_CRITICAL_MS
    ) {
      addAlert(
        alerts,
        'SIGNED_PAYOUT_UNSETTLED',
        'CRITICAL',
        'A signed automatic payout has remained unsettled for at least 30 minutes.',
      );
    } else if (
      oldestUnsettledAgeMs >=
      SIGNED_TX_WARNING_MS
    ) {
      addAlert(
        alerts,
        'SIGNED_PAYOUT_WAITING_FINALITY',
        'WARNING',
        'A signed automatic payout has remained unsettled for at least 10 minutes.',
      );
    }
  }

  const forecast = planning.forecast;
  const maxImmediatelyPayableCount =
    forecast?.maxImmediatelyPayableCount ?? null;

  if (
    queuedCount > 0 &&
    BigInt(pool.effectiveRewardPoolWei) === 0n
  ) {
    addAlert(
      alerts,
      'REWARD_POOL_EMPTY_WITH_QUEUE',
      'CRITICAL',
      'Eligible rewards are queued but the effective user reward pool is empty.',
    );
  }

  if (
    forecast &&
    BigInt(forecast.maxImmediatelyPayableCount) <
      BigInt(queuedCount)
  ) {
    addAlert(
      alerts,
      'REWARD_POOL_CAPACITY_INSUFFICIENT',
      'CRITICAL',
      'The current reward pool cannot immediately cover every queued eligible reward under the active reward policy.',
    );
  } else if (
    forecast &&
    BigInt(forecast.maxImmediatelyPayableCount) <
      BigInt(forecast.stressCompletions)
  ) {
    addAlert(
      alerts,
      'REWARD_POOL_STRESS_BUFFER_LOW',
      'WARNING',
      'The current reward pool is below the predictive stress-recipient buffer.',
    );
  }

  const severity = finalSeverity(alerts);

  return {
    capturedAt: now.toISOString(),
    network: pool.network,
    severity,
    operational: severity !== 'CRITICAL',
    alerts,
    distributor: {
      address: distributorAddress,
      automaticRewardsEnabled:
        automaticRewards.enabled,
      configured:
        automaticRewards.configured,
      registered: distributorRegistered,
      vthoWei,
      gasStatus,
    },
    runtime: {
      funded:
        runtime.mainnetFundedRewardsEnabled,
      emergencyPaused:
        runtime.emergencyRewardsPaused,
      distributionPaused:
        pool.distributionPaused,
    },
    pool: {
      effectiveRewardPoolWei:
        pool.effectiveRewardPoolWei,
      rewardsPoolEnabled:
        pool.rewardsPoolEnabled,
      expectedCompletions:
        forecast?.expectedCompletions ?? null,
      stressCompletions:
        forecast?.stressCompletions ?? null,
      rewardPerInviteWei:
        forecast?.rewardPerInviteWei ?? null,
      maxImmediatelyPayableCount,
    },
    queue: {
      queuedCount,
      oldestQueuedAt,
      oldestQueuedAgeSeconds:
        seconds(oldestQueuedAgeMs),
    },
    payoutPipeline: {
      activeRoundId: stringId(activeRound?.id),
      activeRoundStatus:
        typeof activeRound?.status === 'string'
          ? activeRound.status
          : null,
      activeRoundAgeSeconds:
        seconds(activeRoundAgeMs),
      oldestUnsettledSignedTxId:
        typeof oldestUnsettledSignedTx?.tx_id ===
          'string'
          ? oldestUnsettledSignedTx.tx_id
          : null,
      oldestUnsettledSignedTxAgeSeconds:
        seconds(oldestUnsettledAgeMs),
    },
  };
}
