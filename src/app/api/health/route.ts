import { NextResponse } from 'next/server';

import {
  readRewardOperationsHealth,
} from '@/lib/rewards/operationsMonitoring';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const HEALTH_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

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

    // Keep the deployment revision public so stale Production builds can be
    // detected immediately, but leave distributor addresses, gas state, queue
    // internals and alert codes on the verified-operator operations endpoint.
    return NextResponse.json(
      {
        ok: operations.operational,
        app: 'VeInvite',
        version: '0.1.0',
        deployment,
        database: 'ready',
        network: operations.network,
        automaticRewards: {
          ready: automaticRewardsReady,
        },
        operations: {
          severity: operations.severity,
          operational:
            operations.operational,
          checkedAt: operations.capturedAt,
        },
      },
      {
        status:
          operations.operational ? 200 : 503,
        headers: HEALTH_HEADERS,
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
        headers: HEALTH_HEADERS,
      },
    );
  }
}
