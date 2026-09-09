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

async function readCurrentRoundContext(): Promise<CurrentRoundContext | null> {
  const now = Date.now();
  if (roundCache && roundCache.expiresAt > now) {
    return roundCache.value;
  }
  if (roundInFlight) return roundInFlight;

  roundInFlight = readVeBetterRoundWindow()
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

export async function GET(request: NextRequest) {
  const walletParam = request.nextUrl.searchParams.get('wallet');
  if (!walletParam) {
    return NextResponse.json(
      { error: 'wallet query parameter is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let rootWallet: string;
  try {
    rootWallet = normalizeAddress(walletParam);
  } catch {
    return NextResponse.json(
      { error: 'Invalid wallet address.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    await requireWalletSession({ request, expectedWallet: rootWallet });
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;
    console.error('Failed to validate network wallet session:', error);
    return NextResponse.json(
      { error: 'Failed to validate wallet verification.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const focusParam = request.nextUrl.searchParams.get('focus');
  const focusWallet = focusParam
    ? normalizeOptionalWallet(focusParam)
    : rootWallet;

  if (!focusWallet) {
    return NextResponse.json(
      { error: 'Invalid focus wallet address.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
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

  const round = await readCurrentRoundContext();
  const { data, error } = await supabaseAdmin.rpc(
    'read_referral_network_focus_v2',
    {
      p_root_wallet: rootWallet,
      p_focus_wallet: focusWallet,
      p_search: isSearch ? search : null,
      p_round_id: round?.id ?? null,
      p_round_start_at: round?.startAt ?? null,
      p_round_end_at: round?.endAt ?? null,
    },
  );

  if (error) {
    console.error('Failed to load referral network:', error);
    return NextResponse.json(
      { error: 'Failed to load network.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const payload = (data ?? {}) as NetworkPayload;
  if (payload.error === 'NETWORK_DISABLED') {
    return NextResponse.json(
      { error: 'Network is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (payload.error === 'FOCUS_NOT_IN_NETWORK') {
    return NextResponse.json(
      { error: 'That wallet is not in your VeInvite network.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (payload.error === 'INVALID_WALLET') {
    return NextResponse.json(
      { error: 'Invalid wallet address.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
