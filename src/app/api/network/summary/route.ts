import { NextRequest, NextResponse } from 'next/server';

import { canUseNetworkSurface } from '@/lib/networkRuntimeServer';
import { enforceRateLimits } from '@/lib/rateLimitServer';
import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(request: NextRequest) {
  const walletParam = request.nextUrl.searchParams.get('wallet');
  if (!walletParam) {
    return noStoreJson({ code: 'WALLET_REQUIRED', error: 'wallet query parameter is required' }, 400);
  }

  let walletAddress: string;
  try {
    walletAddress = normalizeAddress(walletParam);
  } catch {
    return noStoreJson({ code: 'INVALID_WALLET', error: 'Invalid wallet address.' }, 400);
  }

  try {
    await requireWalletSession({ request, expectedWallet: walletAddress });
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return noStoreJson({ error: error.message }, error.status);
    }
    console.error('Failed to validate Network summary wallet session:', error);
    return noStoreJson({ code: 'NETWORK_SUMMARY_FAILED', error: 'Failed to validate wallet verification.' }, 500);
  }

  const rateLimitResponse = await enforceRateLimits([
    {
      scope: 'network_summary_wallet',
      subject: walletAddress,
      limit: 90,
      windowSeconds: 60,
    },
  ]);
  if (rateLimitResponse) return rateLimitResponse;

  if (!(await canUseNetworkSurface('my', walletAddress))) {
    return noStoreJson({ code: 'NETWORK_DISABLED', error: 'Network is temporarily unavailable.' }, 503);
  }

  const { data, error } = await supabaseAdmin
    .from('qualified_referral_network_edges')
    .select('child_wallet')
    .eq('sponsor_wallet', walletAddress)
    .limit(1);

  if (error) {
    console.error('Failed to load Network summary:', error);
    return noStoreJson({ code: 'NETWORK_SUMMARY_FAILED', error: 'Failed to load Network summary.' }, 500);
  }

  return noStoreJson({
    summary: {
      // Empty-state only: any descendant necessarily starts with a direct child.
      network: Array.isArray(data) && data.length > 0 ? 1 : 0,
    },
  });
}
