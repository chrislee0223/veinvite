import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

const HEALTH_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

const OPERATIONAL_HEARTBEAT_MAX_AGE_MS =
  36 * 60 * 60 * 1000;

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

function isFreshHeartbeat(value: string | null) {
  if (!value) return false;

  const capturedAt = Date.parse(value);
  if (!Number.isFinite(capturedAt)) return false;

  const ageMs = Date.now() - capturedAt;
  return ageMs >= 0 &&
    ageMs <= OPERATIONAL_HEARTBEAT_MAX_AGE_MS;
}

async function readOperationalFreshness() {
  const [reconcileResult, analyticsResult] =
    await Promise.all([
      supabaseAdmin
        .from('operator_monitor_snapshots')
        .select('captured_at')
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('veinvite_daily_funnel_rollups')
        .select('finalized_at')
        .order('finalized_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (reconcileResult.error) {
    throw new Error(
      `Could not read reconciliation heartbeat: ${reconcileResult.error.message}`,
    );
  }
  if (analyticsResult.error) {
    throw new Error(
      `Could not read analytics heartbeat: ${analyticsResult.error.message}`,
    );
  }

  return {
    reconcileFresh: isFreshHeartbeat(
      reconcileResult.data?.captured_at ?? null,
    ),
    analyticsFresh: isFreshHeartbeat(
      analyticsResult.data?.finalized_at ?? null,
    ),
  };
}

export async function GET() {
  const deployment = readDeploymentMetadata();
  let network: string | null = null;

  try {
    // Public health is intentionally a lightweight app/database readiness
    // probe. Full reward-pool, distributor, gas, queue and payout diagnostics
    // live behind the verified-operator operations API so anonymous uptime
    // probes cannot repeatedly trigger expensive VeChain RPC/planning work.
    network = getVeBetterNetworkConfig().network;

    const [readinessResult, operations] = await Promise.all([
      supabaseAdmin
        .from('invitations')
        .select('invite_code')
        .limit(1),
      readOperationalFreshness(),
    ]);

    if (readinessResult.error) {
      throw readinessResult.error;
    }

    return NextResponse.json(
      {
        ok: true,
        app: 'VeInvite',
        version: '0.1.0',
        deployment,
        database: 'ready',
        network,
        operations,
      },
      {
        status: 200,
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
        network,
        operations: {
          reconcileFresh: false,
          analyticsFresh: false,
        },
      },
      {
        status: 503,
        headers: HEALTH_HEADERS,
      },
    );
  }
}
