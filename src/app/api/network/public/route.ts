import { NextRequest, NextResponse } from 'next/server';

import { canUseNetworkSurface } from '@/lib/networkRuntimeServer';
import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { readVeBetterRoundWindow } from '@/lib/vebetter/entryEligibility';

type PublicNetworkRpcError =
  | 'PUBLIC_NETWORK_DISABLED'
  | 'INVALID_WALLET'
  | 'NETWORK_PRIVATE'
  | 'FOCUS_NOT_PUBLIC';

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
    hasPrivateBranches: boolean;
  }>;
  hasPrivateBranches?: boolean;
  depthLimitReached?: boolean;
};

type CurrentRoundContext = {
  id: number;
  startAt: string;
  endAt: string;
};

const ROUND_RESOLVE_TIMEOUT_MS = 2_500;
const PUBLIC_NETWORK_RPC_TIMEOUT_MS = 5_000;
const ROUND_CACHE_MS = 60_000;
const ROUND_FAILURE_CACHE_MS = 10_000;

let roundCache: { value: CurrentRoundContext | null; expiresAt: number } | null = null;
let roundInFlight: Promise<CurrentRoundContext | null> | null = null;

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

async function readCurrentRoundContext(): Promise<CurrentRoundContext | null> {
  const now = Date.now();
  if (roundCache && roundCache.expiresAt > now) return roundCache.value;
  if (roundInFlight) return roundInFlight;

  roundInFlight = withTimeout(
    readVeBetterRoundWindow(),
    ROUND_RESOLVE_TIMEOUT_MS,
  )
    .then((round) => {
      const value = {
        id: round.roundId,
        startAt: round.roundStartAt,
        endAt: round.roundEndAt,
      } satisfies CurrentRoundContext;
      roundCache = { value, expiresAt: Date.now() + ROUND_CACHE_MS };
      return value;
    })
    .catch((error) => {
      console.warn('Public Network current-round context unavailable:', error);
      roundCache = { value: null, expiresAt: Date.now() + ROUND_FAILURE_CACHE_MS };
      return null;
    })
    .finally(() => {
      roundInFlight = null;
    });

  return roundInFlight;
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

  if (!(await canUseNetworkSurface('public', rootWallet))) {
    return noStoreJson(
      { code: 'PUBLIC_NETWORK_DISABLED', error: 'Public Network is temporarily unavailable.' },
      503,
    );
  }

  const round = await readCurrentRoundContext();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_NETWORK_RPC_TIMEOUT_MS);

  let rpcResult: Awaited<ReturnType<typeof supabaseAdmin.rpc>>;
  try {
    rpcResult = await supabaseAdmin
      .rpc('read_public_referral_network_focus_v1', {
        p_root_wallet: rootWallet,
        p_focus_wallet: focusWallet,
        p_round_id: round?.id ?? null,
        p_round_start_at: round?.startAt ?? null,
        p_round_end_at: round?.endAt ?? null,
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
  if (payload.error === 'NETWORK_PRIVATE') {
    return noStoreJson({ code: 'NETWORK_PRIVATE', error: 'This network is private.' }, 404);
  }
  if (payload.error === 'FOCUS_NOT_PUBLIC') {
    return noStoreJson({ code: 'FOCUS_NOT_PUBLIC', error: 'That branch is not public.' }, 404);
  }
  if (payload.error === 'INVALID_WALLET') {
    return noStoreJson({ code: 'INVALID_WALLET', error: 'Invalid wallet address.' }, 400);
  }

  return noStoreJson(payload as Record<string, unknown>);
}
