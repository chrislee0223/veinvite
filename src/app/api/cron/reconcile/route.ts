import { timingSafeEqual } from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  DEFAULT_RECONCILIATION_BATCH_SIZE,
  runReconciliationBatch,
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

/**
 * Vercel Cron entrypoint.
 *
 * This worker reconciles immutable/derived onboarding evidence, records
 * official VeBetterDAO allocation-claim evidence, maintains growth snapshots,
 * and appends an operator anomaly-monitoring snapshot. It never prepares a
 * reward round, changes Sybil decisions, pauses rewards, or transfers B3TR.
 * Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when
 * CRON_SECRET is configured.
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

  try {
    const allocationSync =
      await syncVeInviteAllocationReceipts();
    const summary =
      await runReconciliationBatch(
        DEFAULT_RECONCILIATION_BATCH_SIZE,
      );
    const roundGrowthReports =
      await maintainRoundGrowthSnapshots();
    const monitoring =
      await runOperatorMonitoringAudit(
        'VERCEL_CRON',
      );

    if (monitoring.severity === 'CRITICAL') {
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
      monitoring.severity === 'WARNING'
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

    return NextResponse.json(
      {
        ...summary,
        allocationSync: {
          network: allocationSync.network,
          observedClaims:
            allocationSync.observedClaims,
          insertedCount:
            allocationSync.insertedCount,
          latestVeBetterRoundId:
            allocationSync.latestReceipt
              ?.vebetter_round_id ?? null,
        },
        roundGrowthReports,
        monitoring: {
          snapshotId: monitoring.snapshotId,
          severity: monitoring.severity,
          alertCount: monitoring.alertCount,
          alerts: monitoring.alerts.map(
            (alert) => alert.code,
          ),
        },
        trigger: 'VERCEL_CRON',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Scheduled reconciliation failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Scheduled reconciliation failed.',
        rewardRoundsPrepared: false,
        transfersPerformed: false,
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
