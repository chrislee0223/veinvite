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
  let network: string | null = null;

  try {
    // Public health is intentionally a lightweight app/database readiness
    // probe. Full reward-pool, distributor, gas, queue and payout diagnostics
    // live behind the verified-operator operations API so anonymous uptime
    // probes cannot repeatedly trigger expensive VeChain RPC/planning work.
    network = getVeBetterNetworkConfig().network;

    const { error } = await supabaseAdmin
      .from('invitations')
      .select('invite_code')
      .limit(1);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        app: 'VeInvite',
        version: '0.1.0',
        deployment,
        database: 'ready',
        network,
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
      },
      {
        status: 503,
        headers: HEALTH_HEADERS,
      },
    );
  }
}
