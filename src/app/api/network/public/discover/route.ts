import { NextRequest, NextResponse } from 'next/server';

import {
  isNetworkCanaryWallet,
  readNetworkRuntimeMode,
} from '@/lib/networkRuntimeServer';
import { enforceRateLimits, getClientIpSubject } from '@/lib/rateLimitServer';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireWalletSession } from '@/lib/walletAuthServer';

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function canCurrentViewerDiscoverPublicNetwork(request: NextRequest): Promise<boolean> {
  const mode = await readNetworkRuntimeMode('public');
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  try {
    const session = await requireWalletSession({ request });
    return isNetworkCanaryWallet(session.walletAddress);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const ipSubject = getClientIpSubject(request);
  const rateLimitResponse = await enforceRateLimits([
    ipSubject
      ? {
          scope: 'network_public_discover_ip',
          subject: ipSubject,
          limit: 30,
          windowSeconds: 60,
        }
      : null,
  ]);
  if (rateLimitResponse) return rateLimitResponse;

  if (!(await canCurrentViewerDiscoverPublicNetwork(request))) {
    return noStoreJson(
      { code: 'PUBLIC_NETWORK_DISABLED', error: 'Public Network is temporarily unavailable.' },
      503,
    );
  }

  const { data, error } = await supabaseAdmin.rpc(
    'read_public_network_discovery_v1',
    { p_limit: 12 },
  );

  if (error) {
    console.error('Failed to load Public Network discovery:', error);
    return noStoreJson(
      { code: 'PUBLIC_NETWORK_DISCOVERY_FAILED', error: 'Public Network discovery is temporarily unavailable.' },
      503,
    );
  }

  const networks = Array.isArray(data) ? data : [];
  return noStoreJson({ networks });
}
