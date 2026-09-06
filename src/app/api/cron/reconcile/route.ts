import { timingSafeEqual } from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  cleanupEphemeralSecurityState,
  type EphemeralCleanupSummary,
} from '@/lib/housekeeping/ephemeralCleanup';
import {
  DEFAULT_RECONCILIATION_BATCH_SIZE,
  runReconciliationBatch,
  type ReconciliationBatchSummary,
} from '@/lib/impact/reconcileBatch';
import {
  runOperatorMonitoringAudit,
} from '@/lib/monitoring/operatorMonitoring';
import {
  publishLeaderboardRoundSnapshots,
  type LeaderboardSnapshotMaintenanceSummary,
} from '@/lib/reporting/leaderboardSnapshots';
import {
  reconcileOperatorFastStatus,
  type OperatorFastStatusReconciliation,
} from '@/lib/reporting/operatorFastStatus';
import {
  maintainRoundGrowthSnapshots,
} from '@/lib/reporting/roundGrowthSnapshots';
import {
  syncVeInviteAllocationReceipts,
} from '@/lib/rewards/allocationAccounting';
import {
  runAutomaticRewardPayout,
  type AutomaticRewardPayoutResult,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import {
  runSybilBehaviorObservation,
  type SybilBehaviorObservationSummary,
} from '@/lib/sybil/behaviorObservation';
import {
  runSybilObservationBatch,
  type SybilObservationBatchSummary,
} from '@/lib/sybil/observationBatch';
import type { VeBetterNetwork } from '@/lib/vebetter/network';

function secureEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function authorizeCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      error: 'Cron secret is not configured.',
    };
  }

  const authorization =
    request.headers.get('authorization');
  const expected = `Bearer ${secret}`;

  if (
    !authorization ||
    !secureEquals(authorization, expected)
  ) {
    return {
      ok: false as const,
      status: 401,
      error: 'Unauthorized.',
    };
  }

  return { ok: true as const };
}

type CronStageFailure =
  | 'ALLOCATION_SYNC'
  | 'RECONCILIATION'
  | 'SYBIL_OBSERVATION'
  | 'SYBIL_BEHAVIOR_OBSERVATION'
  | 'AUTOMATIC_REWARD_PAYOUT'
  | 'ROUND_GROWTH_REPORTING'
  | 'LEADERBOARD_SNAPSHOTS'
  | 'HOUSEKEEPING'
  | 'FAST_STATUS_RECONCILIATION'
  | 'MONITORING';

function logStageFailure(
  stage: CronStageFailure,
  error: unknown,
) {
  console.error(
    `Scheduled reconciliation stage ${stage} failed:`,
    error,
  );
}

/**
 * Vercel Cron entrypoint.
 *
 * This worker reconciles immutable/derived onboarding evidence, records
 * official VeBetterDAO allocation-claim evidence, maintains growth snapshots,
 * publishes the immutable paid-referral leaderboard baseline for newly sealed
 * rounds, verifies the read-optimized operator status projection against
 * authoritative source tables, appends an operator anomaly-monitoring snapshot,
 * removes only expired authentication/rate-limit runtime state, and provides a
 * recovery trigger for the dedicated automatic Reward Distributor. When the
 * explicit SYBIL_OBSERVATION_ENABLED gate is true it also captures immutable,
 * observation-only on-chain funding evidence and reads derived behavior
 * fingerprints from invite_impact_events. Those observations are deliberately
 * separate from invitations.sybil_status and cannot change reward authority.
 * Automatic reward execution is itself fail-closed and remains disabled unless
 * its explicit server gate, matching signer address, on-chain distributor
 * registration and every reward safety check pass. The operations/admin wallet
 * key is never used here.
 *
 * Independent stages are deliberately isolated. A transient allocation RPC
 * failure must not prevent invitation reconciliation or anomaly monitoring.
 * Growth reporting is the exception: it runs only after reconciliation has
 * succeeded so a partially refreshed evidence set cannot be snapshotted as a
 * completed reporting round. Leaderboard publication runs only after that
 * growth-maintenance stage succeeds, which prevents a rank baseline from being
 * published before reconciliation has checked through the sealed round end.
 * Any scheduled-stage failure still returns HTTP 500 after later independent
 * stages finish, so operational drift remains visible without weakening reward
 * or evidence safety.
 */
export async function GET(
  request: NextRequest,
) {
  const authorization =
    authorizeCron(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      {
        status: authorization.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const failedStages: CronStageFailure[] = [];
  let allocationSync: Awaited<
    ReturnType<typeof syncVeInviteAllocationReceipts>
  > | null = null;
  let summary: ReconciliationBatchSummary | null = null;
  let sybilObservation:
    SybilObservationBatchSummary | null = null;
  let sybilBehaviorObservation:
    SybilBehaviorObservationSummary | null = null;
  let automaticRewardPayout:
    AutomaticRewardPayoutResult | null = null;
  let roundGrowthReports: Awaited<
    ReturnType<typeof maintainRoundGrowthSnapshots>
  > | null = null;
  let leaderboardSnapshots:
    LeaderboardSnapshotMaintenanceSummary | null = null;
  let housekeeping: EphemeralCleanupSummary | null = null;
  let fastStatusReconciliation:
    OperatorFastStatusReconciliation | null = null;
  let monitoring: Awaited<
    ReturnType<typeof runOperatorMonitoringAudit>
  > | null = null;

  try {
    allocationSync =
      await syncVeInviteAllocationReceipts();
  } catch (error) {
    failedStages.push('ALLOCATION_SYNC');
    logStageFailure('ALLOCATION_SYNC', error);
  }

  try {
    summary =
      await runReconciliationBatch(
        DEFAULT_RECONCILIATION_BATCH_SIZE,
      );
  } catch (error) {
    failedStages.push('RECONCILIATION');
    logStageFailure('RECONCILIATION', error);
  }

  try {
    sybilObservation =
      await runSybilObservationBatch();
  } catch (error) {
    failedStages.push('SYBIL_OBSERVATION');
    logStageFailure('SYBIL_OBSERVATION', error);
  }

  try {
    sybilBehaviorObservation =
      await runSybilBehaviorObservation();
  } catch (error) {
    failedStages.push('SYBIL_BEHAVIOR_OBSERVATION');
    logStageFailure('SYBIL_BEHAVIOR_OBSERVATION', error);
  }

  if (
    sybilBehaviorObservation?.enabled &&
    sybilBehaviorObservation.watchCandidates > 0
  ) {
    console.warn(
      'VeInvite observation-only behavior monitoring found WATCH candidates:',
      {
        fingerprintVersion:
          sybilBehaviorObservation.fingerprintVersion,
        comparedPairs:
          sybilBehaviorObservation.comparedPairs,
        watchCandidates:
          sybilBehaviorObservation.watchCandidates,
        highestObservationScore:
          sybilBehaviorObservation.highestObservationScore,
      },
    );
  }

  // A normal invite-progress request triggers immediate payout as soon as a
  // referral becomes verified/eligible. Cron is the recovery path: it can
  // resume a journaled broadcast or finalize a transaction if the browser was
  // closed or an earlier serverless invocation ended before finality.
  try {
    automaticRewardPayout =
      await runAutomaticRewardPayout();
  } catch (error) {
    failedStages.push(
      'AUTOMATIC_REWARD_PAYOUT',
    );
    logStageFailure(
      'AUTOMATIC_REWARD_PAYOUT',
      error,
    );
  }

  if (summary) {
    try {
      roundGrowthReports =
        await maintainRoundGrowthSnapshots();
    } catch (error) {
      failedStages.push(
        'ROUND_GROWTH_REPORTING',
      );
      logStageFailure(
        'ROUND_GROWTH_REPORTING',
        error,
      );
    }
  }

  if (roundGrowthReports) {
    try {
      leaderboardSnapshots =
        await publishLeaderboardRoundSnapshots(
          roundGrowthReports.network as VeBetterNetwork,
        );
    } catch (error) {
      failedStages.push('LEADERBOARD_SNAPSHOTS');
      logStageFailure('LEADERBOARD_SNAPSHOTS', error);
    }
  }

  try {
    housekeeping =
      await cleanupEphemeralSecurityState();
  } catch (cleanupError) {
    failedStages.push('HOUSEKEEPING');
    logStageFailure('HOUSEKEEPING', cleanupError);
  }

  try {
    fastStatusReconciliation =
      await reconcileOperatorFastStatus();
  } catch (error) {
    failedStages.push(
      'FAST_STATUS_RECONCILIATION',
    );
    logStageFailure(
      'FAST_STATUS_RECONCILIATION',
      error,
    );
  }

  try {
    monitoring =
      await runOperatorMonitoringAudit(
        'VERCEL_CRON',
      );
  } catch (error) {
    failedStages.push('MONITORING');
    logStageFailure('MONITORING', error);
  }

  if (monitoring?.severity === 'CRITICAL') {
    console.error(
      'VeInvite operator monitoring detected critical anomalies:',
      {
        snapshotId: monitoring.snapshotId,
        network: monitoring.network,
        alerts: monitoring.alerts.map(
          (alert) => alert.code,
        ),
      },
    );
  } else if (
    monitoring?.severity === 'WARNING'
  ) {
    console.warn(
      'VeInvite operator monitoring detected warning signals:',
      {
        snapshotId: monitoring.snapshotId,
        network: monitoring.network,
        alerts: monitoring.alerts.map(
          (alert) => alert.code,
        ),
      },
    );
  }

  const hasCoreFailure =
    failedStages.length > 0;

  return NextResponse.json(
    {
      ...(summary ?? {
        rewardRoundsPrepared: false,
        transfersPerformed: false,
      }),
      reconciliation: summary,
      allocationSync: allocationSync
        ? {
            network: allocationSync.network,
            observedClaims:
              allocationSync.observedClaims,
            insertedCount:
              allocationSync.insertedCount,
            latestVeBetterRoundId:
              allocationSync.latestReceipt
                ?.vebetter_round_id ?? null,
          }
        : null,
      sybilObservation,
      sybilBehaviorObservation,
      automaticRewardPayout,
      roundGrowthReports,
      leaderboardSnapshots,
      housekeeping,
      fastStatusReconciliation,
      monitoring: monitoring
        ? {
            snapshotId: monitoring.snapshotId,
            severity: monitoring.severity,
            alertCount: monitoring.alertCount,
            alerts: monitoring.alerts.map(
              (alert) => alert.code,
            ),
          }
        : null,
      trigger: 'VERCEL_CRON',
      partialFailure: hasCoreFailure,
      failedStages,
    },
    {
      status: hasCoreFailure ? 500 : 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
