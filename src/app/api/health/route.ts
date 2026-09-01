import { NextResponse } from 'next/server';

import {
  readRewardOperationsHealth,
} from '@/lib/rewards/operationsMonitoring';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

function readDeploymentMetadata() {
  const gitCommitSha =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;

  return {
    environment:
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV ??
      'unknown',
    gitCommitSha,
    gitCommitShortSha:
      gitCommitSha?.slice(0, 12) ?? null,
  };
}

export async function GET() {
  const deployment = readDeploymentMetadata();

  try {
    const { error } = await supabaseAdmin
      .from('invitations')
      .select('invite_code', {
        head: true,
        count: 'exact',
      });

    if (error) {
      throw error;
    }

    const operations =
      await readRewardOperationsHealth();
    const automaticRewardsReady = Boolean(
      operations.operational &&
      operations.distributor
        .automaticRewardsEnabled &&
      operations.distributor.configured &&
      operations.distributor.registered &&
      !operations.runtime.distributionPaused,
    );
    const alertCodes = operations.alerts.map(
      (alert) => alert.code,
    );

    if (operations.severity === 'CRITICAL') {
      console.error(
        'VeInvite reward operations health is critical:',
        { alertCodes },
      );
    } else if (
      operations.severity === 'WARNING'
    ) {
      console.warn(
        'VeInvite reward operations health has warnings:',
        { alertCodes },
      );
    }

    return NextResponse.json(
      {
        ok: operations.operational,
        app: 'VeInvite',
        version: '0.1.0',
        deployment,
        database: 'ready',
        network: operations.network,
        automaticRewards: {
          enabled:
            operations.distributor
              .automaticRewardsEnabled,
          configured:
            operations.distributor.configured,
          distributorAddress:
            operations.distributor.address,
          distributorRegistered:
            operations.distributor.registered,
          distributionPaused:
            operations.runtime
              .distributionPaused,
          ready: automaticRewardsReady,
        },
        operations: {
          severity: operations.severity,
          operational:
            operations.operational,
          alertCodes,
          gasStatus:
            operations.distributor.gasStatus,
          queueHealthy:
            !alertCodes.includes(
              'REWARD_QUEUE_DELAYED',
            ) &&
            !alertCodes.includes(
              'REWARD_QUEUE_STALLED',
            ),
          payoutPipelineHealthy:
            !alertCodes.includes(
              'REWARD_ROUND_DELAYED',
            ) &&
            !alertCodes.includes(
              'REWARD_ROUND_STALLED',
            ) &&
            !alertCodes.includes(
              'SIGNED_PAYOUT_WAITING_FINALITY',
            ) &&
            !alertCodes.includes(
              'SIGNED_PAYOUT_UNSETTLED',
            ),
          poolCapacityHealthy:
            !alertCodes.includes(
              'REWARD_POOL_EMPTY_WITH_QUEUE',
            ) &&
            !alertCodes.includes(
              'REWARD_POOL_CAPACITY_INSUFFICIENT',
            ),
          checkedAt: operations.capturedAt,
        },
      },
      {
        status:
          operations.operational ? 200 : 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'VeInvite readiness check failed:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        app: 'VeInvite',
        version: '0.1.0',
        deployment,
        database: 'unavailable',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
