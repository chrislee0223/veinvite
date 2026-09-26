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
  markCronJobFailed,
  markCronJobStarted,
  markCronJobSucceeded,
} from '@/lib/monitoring/cronHeartbeat';
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
  runB3trRecipientObservationBatch,
  type B3trRecipientObservationBatchSummary,
} from '@/lib/sybil/recipientB3trObservationBatch';
import {
  runSybilObservationBatch,
  type SybilObservationBatchSummary,
} from '@/lib/sybil/observationBatch';
import {
  enqueueSybilV2EvidenceBacklogBatch,
  enqueueSybilV2PaidBackfillBatch,
  type SybilV2EvidenceBacklogEnqueueSummary,
  type SybilV2PaidBackfillEnqueueSummary,
} from '@/lib/sybil/v2/evidenceQueue';
import {
  runSybilV2AssessmentBatch,
  runSybilV2EvidenceCollectionBatch,
} from '@/lib/sybil/v2/pipeline';
import {
  runPostPayoutSybilV2BridgeBatch,
} from '@/lib/sybil/v2/postPayout';
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
  | 'SYBIL_V2_EVIDENCE'
  | 'SYBIL_V2_EVIDENCE_QUEUE'
  | 'SYBIL_V2_PAID_BACKFILL'
  | 'SYBIL_V2_ASSESSMENT'
  | 'SYBIL_OBSERVATION'
  | 'SYBIL_BEHAVIOR_OBSERVATION'
  | 'AUTOMATIC_REWARD_PAYOUT'
  | 'B3TR_RECIPIENT_OBSERVATION'
  | 'SYBIL_V2_POST_PAYOUT'
  | 'ROUND_GROWTH_REPORTING'
  | 'LEADERBOARD_SNAPSHOTS'
  | 'HOUSEKEEPING'
  | 'FAST_STATUS_RECONCILIATION'
  | 'MONITORING'
  | 'CRON_HEARTBEAT';

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
 * fingerprints from invite_impact_events. When the independent
 * SYBIL_B3TR_OBSERVATION_ENABLED gate is true it additionally records one
 * append-only B3TR recipient-flow observation after each finalized payout has
 * aged for approximately 24 hours. Those observations are deliberately
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

  try {
    await markCronJobStarted(
      'daily-reconcile',
    );
  } catch (error) {
    failedStages.push('CRON_HEARTBEAT');
    logStageFailure(
      'CRON_HEARTBEAT',
      error,
    );
  }
  let allocationSync: Awaited<
    ReturnType<typeof syncVeInviteAllocationReceipts>
  > | null = null;
  let summary: ReconciliationBatchSummary | null = null;
  let sybilV2Evidence:
    Awaited<ReturnType<typeof runSybilV2EvidenceCollectionBatch>> | null = null;
  let sybilV2EvidenceQueue:
    SybilV2EvidenceBacklogEnqueueSummary | null = null;
  let sybilV2PaidBackfill:
    SybilV2PaidBackfillEnqueueSummary | null = null;
  let sybilV2Assessment:
    Awaited<ReturnType<typeof runSybilV2AssessmentBatch>> | null = null;
  let sybilObservation:
    SybilObservationBatchSummary | null = null;
  let sybilBehaviorObservation:
    SybilBehaviorObservationSummary | null = null;
  let automaticRewardPayout:
    AutomaticRewardPayoutResult | null = null;
  let b3trRecipientObservation:
    B3trRecipientObservationBatchSummary | null = null;
  let sybilV2PostPayout:
    Awaited<ReturnType<typeof runPostPayoutSybilV2BridgeBatch>> | null = null;
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
    sybilV2Evidence =
      await runSybilV2EvidenceCollectionBatch(4);
  } catch (error) {
    failedStages.push('SYBIL_V2_EVIDENCE');
    logStageFailure('SYBIL_V2_EVIDENCE', error);
  }

  try {
    sybilV2EvidenceQueue =
      await enqueueSybilV2EvidenceBacklogBatch(50);
  } catch (error) {
    failedStages.push('SYBIL_V2_EVIDENCE_QUEUE');
    logStageFailure('SYBIL_V2_EVIDENCE_QUEUE', error);
  }

  try {
    sybilV2PaidBackfill =
      await enqueueSybilV2PaidBackfillBatch(4);
  } catch (error) {
    failedStages.push('SYBIL_V2_PAID_BACKFILL');
    logStageFailure('SYBIL_V2_PAID_BACKFILL', error);
  }

  try {
    sybilV2Assessment =
      await runSybilV2AssessmentBatch(10);
  } catch (error) {
    failedStages.push('SYBIL_V2_ASSESSMENT');
    logStageFailure('SYBIL_V2_ASSESSMENT', error);
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

  // Recipient-flow forensics are intentionally after payout recovery. They are
  // observation-only and must never delay or gate reward execution.
  try {
    b3trRecipientObservation =
      await runB3trRecipientObservationBatch();
  } catch (error) {
    failedStages.push(
      'B3TR_RECIPIENT_OBSERVATION',
    );
    logStageFailure(
      'B3TR_RECIPIENT_OBSERVATION',
      error,
    );
  }

  try {
    sybilV2PostPayout =
      await runPostPayoutSybilV2BridgeBatch(10);
  } catch (error) {
    failedStages.push('SYBIL_V2_POST_PAYOUT');
    logStageFailure('SYBIL_V2_POST_PAYOUT', error);
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

  try {
    if (failedStages.length > 0) {
      await markCronJobFailed(
        'daily-reconcile',
        failedStages.join(','),
      );
    } else {
      await markCronJobSucceeded(
        'daily-reconcile',
      );
    }
  } catch (error) {
    if (
      !failedStages.includes(
        'CRON_HEARTBEAT',
      )
    ) {
      failedStages.push(
        'CRON_HEARTBEAT',
      );
    }
    logStageFailure(
      'CRON_HEARTBEAT',
      error,
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
      sybilV2Evidence,
      sybilV2EvidenceQueue,
      sybilV2PaidBackfill,
      sybilV2Assessment,
      sybilObservation,
      sybilBehaviorObservation,
      automaticRewardPayout,
      b3trRecipientObservation,
      sybilV2PostPayout,
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
