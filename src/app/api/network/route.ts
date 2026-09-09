import { NextRequest, NextResponse } from 'next/server';

import { enforceRateLimits } from '@/lib/rateLimitServer';
import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { readVeBetterRoundWindow } from '@/lib/vebetter/entryEligibility';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

type NetworkRpcError =
  | 'INVALID_WALLET'
  | 'FOCUS_NOT_IN_NETWORK'
  | 'NETWORK_DISABLED';

type NetworkApiErrorCode =
  | 'WALLET_REQUIRED'
  | 'INVALID_WALLET'
  | 'INVALID_FOCUS_WALLET'
  | 'NETWORK_DISABLED'
  | 'FOCUS_NOT_IN_NETWORK'
  | 'NETWORK_TIMEOUT'
  | 'NETWORK_LOAD_FAILED';

type NetworkMemberStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';

type NetworkChild = {
  wallet: string;
  status: NetworkMemberStatus;
  joinedAt: string | null;
  network: number;
  direct: number;
  qualified: number;
  thisRound: number | null;
  depth: number;
};

type NetworkSearchResult = {
  wallet: string;
  parentWallet: string | null;
  depth: number;
};

type NetworkPayload = {
  error?: NetworkRpcError;
  rootWallet?: string;
  focusWallet?: string;
  focusDepth?: number;
  invitedBy?: string | null;
  breadcrumb?: string[];
  summary?: {
    network: number;
    direct: number;
    qualified: number;
    thisRound: number | null;
    depth: number;
  };
  round?: {
    id: number;
    startAt: string;
    endAt: string;
  } | null;
  children?: NetworkChild[];
  searchResults?: NetworkSearchResult[];
  depthLimitReached?: boolean;
};

type CurrentRoundContext = {
  id: number;
  startAt: string;
  endAt: string;
};

const ROUND_CACHE_MS = 60_000;
const ROUND_FAILURE_CACHE_MS = 10_000;
const ROUND_RESOLVE_TIMEOUT_MS = 2_500;
const NETWORK_RPC_TIMEOUT_MS = 5_000;
let roundCache: {
  value: CurrentRoundContext | null;
  expiresAt: number;
} | null = null;
let roundInFlight: Promise<CurrentRoundContext | null> | null = null;

function walletAuthResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WalletAuthenticationError)) return null;
  return NextResponse.json(
    { error: error.message },
    {
      status: error.status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

function networkError(
  code: NetworkApiErrorCode,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    { code, error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function normalizeOptionalWallet(value: string | null): string | null {
  if (!value) return null;
  try {
    return normalizeAddress(value);
  } catch {
    return null;
  }
}

function normalizeSearch(value: string | null): string {
  if (!value) return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-fx]/g, '')
    .slice(0, 42);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

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
  if (roundCache && roundCache.expiresAt > now) {
    return roundCache.value;
  }
  if (roundInFlight) return roundInFlight;

  roundInFlight = withTimeout(
    readVeBetterRoundWindow(),
    ROUND_RESOLVE_TIMEOUT_MS,
    'Network current-round resolver',
  )
    .then((round) => {
      const value = {
        id: round.roundId,
        startAt: round.roundStartAt,
        endAt: round.roundEndAt,
      } satisfies CurrentRoundContext;
      roundCache = {
        value,
        expiresAt: Date.now() + ROUND_CACHE_MS,
      };
      return value;
    })
    .catch((error) => {
      console.warn(
        'Network current-round context is temporarily unavailable; serving Network without This Round metrics:',
        error,
      );
      roundCache = {
        value: null,
        expiresAt: Date.now() + ROUND_FAILURE_CACHE_MS,
      };
      return null;
    })
    .finally(() => {
      roundInFlight = null;
    });

  return roundInFlight;
}

async function networkRuntimeEnabled(): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('network_runtime_config')
    .select('enabled')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('Failed to read Network runtime switch:', error);
    return false;
  }
  return data?.enabled === true;
}

export async function GET(request: NextRequest) {
  const walletParam = request.nextUrl.searchParams.get('wallet');
  if (!walletParam) {
    return networkError('WALLET_REQUIRED', 'wallet query parameter is required', 400);
  }

  let rootWallet: string;
  try {
    rootWallet = normalizeAddress(walletParam);
  } catch {
    return networkError('INVALID_WALLET', 'Invalid wallet address.', 400);
  }

  try {
    await requireWalletSession({ request, expectedWallet: rootWallet });
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;
    console.error('Failed to validate network wallet session:', error);
    return networkError(
      'NETWORK_LOAD_FAILED',
      'Failed to validate wallet verification.',
      500,
    );
  }

  const focusParam = request.nextUrl.searchParams.get('focus');
  const focusWallet = focusParam
    ? normalizeOptionalWallet(focusParam)
    : rootWallet;

  if (!focusWallet) {
    return networkError('INVALID_FOCUS_WALLET', 'Invalid focus wallet address.', 400);
  }

  const search = normalizeSearch(request.nextUrl.searchParams.get('q'));
  const isSearch = search.length >= 3;
  const rateLimitResponse = await enforceRateLimits([
    {
      scope: isSearch ? 'network_search_wallet' : 'network_read_wallet',
      subject: rootWallet,
      limit: isSearch ? 24 : 90,
      windowSeconds: 60,
    },
  ]);
  if (rateLimitResponse) return rateLimitResponse;

  // Read the database-backed switch before any chain request or recursive graph
  // work. Missing/unreadable configuration also fails closed.
  if (!(await networkRuntimeEnabled())) {
    return networkError(
      'NETWORK_DISABLED',
      'Network is temporarily unavailable.',
      503,
    );
  }

  const round = await readCurrentRoundContext();
  const rpcController = new AbortController();
  const rpcTimer = setTimeout(
    () => rpcController.abort(),
    NETWORK_RPC_TIMEOUT_MS,
  );

  let rpcResult: Awaited<ReturnType<typeof supabaseAdmin.rpc>>;
  try {
    rpcResult = await supabaseAdmin
      .rpc(
        'read_referral_network_focus_v2',
        {
          p_root_wallet: rootWallet,
          p_focus_wallet: focusWallet,
          p_search: isSearch ? search : null,
          p_round_id: round?.id ?? null,
          p_round_start_at: round?.startAt ?? null,
          p_round_end_at: round?.endAt ?? null,
        },
      )
      .abortSignal(rpcController.signal);
  } catch (error) {
    if (rpcController.signal.aborted) {
      console.warn('Network recursive read timed out.', { rootWallet });
      return networkError(
        'NETWORK_TIMEOUT',
        'Network took too long to load.',
        503,
      );
    }
    console.error('Failed to load referral network:', error);
    return networkError('NETWORK_LOAD_FAILED', 'Failed to load network.', 500);
  } finally {
    clearTimeout(rpcTimer);
  }

  const { data, error } = rpcResult;
  if (error) {
    if (rpcController.signal.aborted) {
      console.warn('Network recursive read timed out.', { rootWallet });
      return networkError(
        'NETWORK_TIMEOUT',
        'Network took too long to load.',
        503,
      );
    }
    console.error('Failed to load referral network:', error);
    return networkError('NETWORK_LOAD_FAILED', 'Failed to load network.', 500);
  }

  const payload = (data ?? {}) as NetworkPayload;
  if (payload.error === 'NETWORK_DISABLED') {
    return networkError(
      'NETWORK_DISABLED',
      'Network is temporarily unavailable.',
      503,
    );
  }
  if (payload.error === 'FOCUS_NOT_IN_NETWORK') {
    return networkError(
      'FOCUS_NOT_IN_NETWORK',
      'That wallet is not in your VeInvite network.',
      404,
    );
  }
  if (payload.error === 'INVALID_WALLET') {
    return networkError('INVALID_WALLET', 'Invalid wallet address.', 400);
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
