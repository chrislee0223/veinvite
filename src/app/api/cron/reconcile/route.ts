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
  syncVeInviteAllocationReceipts,
} from '@/lib/rewards/allocationAccounting';
import {
  maintainRoundGrowthSnapshots,
} from '@/lib/reporting/roundGrowthSnapshots';

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
  | 'ROUND_GROWTH_REPORTING'
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
 * appends an operator anomaly-monitoring snapshot, and removes only expired
 * authentication/rate-limit runtime state. It never prepares a reward round,
 * changes Sybil decisions, pauses rewards, deletes audit/reward evidence, or
 * transfers B3TR. Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is configured.
 *
 * Independent stages are deliberately isolated. A transient allocation RPC
 * failure must not prevent invitation reconciliation or anomaly monitoring.
 * Growth reporting is the exception: it runs only after reconciliation has
 * succeeded so a partially refreshed evidence set cannot be snapshotted as a
 * completed reporting round. Any core-stage failure still returns HTTP 500 so
 * the deployment remains visibly unhealthy even when later stages complete.
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
  let roundGrowthReports: Awaited<
    ReturnType<typeof maintainRoundGrowthSnapshots>
  > | null = null;
  let housekeeping: EphemeralCleanupSummary | null = null;
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

  try {
    housekeeping =
      await cleanupEphemeralSecurityState();
  } catch (cleanupError) {
    // Housekeeping is deliberately best-effort. A cleanup failure must not
    // block evidence reconciliation, allocation sync, or anomaly monitoring.
    console.warn(
      'VeInvite ephemeral housekeeping failed:',
      cleanupError,
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
      roundGrowthReports,
      housekeeping,
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
