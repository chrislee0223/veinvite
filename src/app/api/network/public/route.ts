import { NextRequest, NextResponse } from 'next/server';

import {
  isNetworkCanaryWallet,
  readNetworkRuntimeMode,
} from '@/lib/networkRuntimeServer';
import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireWalletSession } from '@/lib/walletAuthServer';

type PublicNetworkRpcError =
  | 'PUBLIC_NETWORK_DISABLED'
  | 'INVALID_WALLET'
  | 'FOCUS_NOT_FOUND';

type PublicNetworkPayload = {
  error?: PublicNetworkRpcError;
  rootWallet?: string;
  focusWallet?: string;
  focusDepth?: number;
  breadcrumb?: string[];
  summary?: {
    network: number;
    direct: number;
    thisRound: number | null;
    depth: number;
  };
  children?: Array<{
    wallet: string;
    network: number;
    direct: number;
    thisRound: number | null;
    depth: number;
  }>;
  depthLimitReached?: boolean;
};

const PUBLIC_NETWORK_RPC_TIMEOUT_MS = 5_000;


function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function normalizeOptionalWallet(value: string | null): string | null {
  if (!value) return null;
  try {
    return normalizeAddress(value);
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PUBLIC_NETWORK_TIMEOUT')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function canCurrentViewerUsePublicNetwork(request: NextRequest): Promise<boolean> {
  const mode = await readNetworkRuntimeMode('public');
  if (mode === 'on') return true;
  if (mode === 'off') return false;

  // Canary is intentionally viewer-gated. A canary root must not become
  // guest-readable before the Public surface is fully enabled.
  try {
    const session = await requireWalletSession({ request });
    return isNetworkCanaryWallet(session.walletAddress);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const walletParam = request.nextUrl.searchParams.get('wallet');
  if (!walletParam) {
    return noStoreJson({ code: 'WALLET_REQUIRED', error: 'wallet query parameter is required' }, 400);
  }

  let rootWallet: string;
  try {
    rootWallet = normalizeAddress(walletParam);
  } catch {
    return noStoreJson({ code: 'INVALID_WALLET', error: 'Invalid wallet address.' }, 400);
  }

  const focusParam = request.nextUrl.searchParams.get('focus');
  const focusWallet = focusParam
    ? normalizeOptionalWallet(focusParam)
    : rootWallet;

  if (!focusWallet) {
    return noStoreJson({ code: 'INVALID_FOCUS_WALLET', error: 'Invalid focus wallet address.' }, 400);
  }

  const ipSubject = getClientIpSubject(request);
  const rateLimitResponse = await enforceRateLimits([
    ipSubject
      ? {
          scope: 'network_public_ip',
          subject: ipSubject,
          limit: 60,
          windowSeconds: 60,
        }
      : null,
    {
      scope: 'network_public_target',
      subject: rootWallet,
      limit: 120,
      windowSeconds: 60,
    },
  ]);
  if (rateLimitResponse) return rateLimitResponse;

  if (!(await canCurrentViewerUsePublicNetwork(request))) {
    return noStoreJson(
      { code: 'PUBLIC_NETWORK_DISABLED', error: 'Public Network is temporarily unavailable.' },
      503,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_NETWORK_RPC_TIMEOUT_MS);

  let rpcResult: Awaited<ReturnType<typeof supabaseAdmin.rpc>>;
  try {
    rpcResult = await supabaseAdmin
      .rpc('read_public_referral_network_focus_v1', {
        p_root_wallet: rootWallet,
        p_focus_wallet: focusWallet,
        p_round_id: null,
        p_round_start_at: null,
        p_round_end_at: null,
      })
      .abortSignal(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      return noStoreJson({ code: 'PUBLIC_NETWORK_TIMEOUT', error: 'Public Network took too long to load.' }, 503);
    }
    console.error('Failed to load Public Network:', error);
    return noStoreJson({ code: 'PUBLIC_NETWORK_LOAD_FAILED', error: 'Failed to load Public Network.' }, 500);
  } finally {
    clearTimeout(timer);
  }

  const { data, error } = rpcResult;
  if (error) {
    console.error('Public Network RPC failed:', error);
    return noStoreJson({ code: 'PUBLIC_NETWORK_LOAD_FAILED', error: 'Failed to load Public Network.' }, 500);
  }

  const payload = (data ?? {}) as PublicNetworkPayload;
  if (payload.error === 'PUBLIC_NETWORK_DISABLED') {
    return noStoreJson({ code: 'PUBLIC_NETWORK_DISABLED', error: 'Public Network is temporarily unavailable.' }, 503);
  }
  if (payload.error === 'FOCUS_NOT_FOUND') {
    return noStoreJson({ code: 'FOCUS_NOT_FOUND', error: 'That wallet is not part of this network.' }, 404);
  }
  if (payload.error === 'INVALID_WALLET') {
    return noStoreJson({ code: 'INVALID_WALLET', error: 'Invalid wallet address.' }, 400);
  }

  // This endpoint exposes referral-graph structure only. Mission, reward,
  // anti-Sybil, security, invitation-detail, and signing data are not selected
  // by the database reader and therefore never enter the browser payload.
  return noStoreJson(payload as Record<string, unknown>);
}
