'use client';

import type { PublicLeaderboardResponse } from '@/lib/types';

const FRESH_FOR_MS = 30_000;
const PUBLIC_SESSION_MAX_AGE_MS = 5 * 60_000;
const PUBLIC_SESSION_STORAGE_KEY = 'veinvite_public_leaderboard_seed_v1';
const ANONYMOUS_WALLET_KEY = 'anonymous';

type CacheEntry = {
  data: PublicLeaderboardResponse;
  fetchedAt: number;
};

type StoredPublicLeaderboard = {
  savedAt: number;
  data: PublicLeaderboardResponse;
};

const cache = new Map<string, CacheEntry>();
const latestNetworkByWallet = new Map<string, string>();
const inFlight = new Map<string, Promise<PublicLeaderboardResponse>>();

function normalizeWallet(wallet: string | null): string {
  return wallet?.trim().toLowerCase() || ANONYMOUS_WALLET_KEY;
}

function networkCacheKey(network: string, walletKey: string): string {
  return `${network}:${walletKey}`;
}

function isPublicLeaderboardSeed(
  value: unknown,
): value is PublicLeaderboardResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PublicLeaderboardResponse>;

  return (
    typeof candidate.generatedAt === 'string' &&
    typeof candidate.network === 'string' &&
    typeof candidate.currentRoundId === 'number' &&
    candidate.currentRoundId >= 0 &&
    Array.isArray(candidate.leaders) &&
    candidate.leaders.every((entry) =>
      Boolean(
        entry &&
        typeof entry.walletAddress === 'string' &&
        typeof entry.rank === 'number' &&
        typeof entry.completedReferrals === 'number' &&
        typeof entry.totalRewardWei === 'string',
      ),
    ) &&
    Boolean(
      candidate.impact &&
      typeof candidate.impact.totalActivatedUsers === 'number' &&
      typeof candidate.impact.newUsers === 'number' &&
      typeof candidate.impact.returningUsers === 'number',
    ) &&
    Boolean(
      candidate.comparison &&
      typeof candidate.comparison.rankingAlgorithmVersion === 'string',
    ) &&
    candidate.currentUser === null
  );
}

function hydratePublicSessionSeed(): PublicLeaderboardResponse | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(PUBLIC_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredPublicLeaderboard>;
    if (
      typeof stored.savedAt !== 'number' ||
      !Number.isFinite(stored.savedAt) ||
      Date.now() - stored.savedAt > PUBLIC_SESSION_MAX_AGE_MS ||
      !isPublicLeaderboardSeed(stored.data)
    ) {
      window.sessionStorage.removeItem(PUBLIC_SESSION_STORAGE_KEY);
      return null;
    }

    const data = stored.data;
    const walletKey = ANONYMOUS_WALLET_KEY;
    latestNetworkByWallet.set(walletKey, data.network);
    cache.set(networkCacheKey(data.network, walletKey), {
      data,
      fetchedAt: stored.savedAt,
    });
    return data;
  } catch {
    try {
      window.sessionStorage.removeItem(PUBLIC_SESSION_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in hardened/private browser modes.
    }
    return null;
  }
}

function persistPublicSessionSeed(data: PublicLeaderboardResponse): void {
  if (typeof window === 'undefined' || data.currentUser !== null) return;

  try {
    window.sessionStorage.setItem(
      PUBLIC_SESSION_STORAGE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies StoredPublicLeaderboard),
    );
  } catch {
    // The in-memory cache still works if session storage is unavailable.
  }
}

export function getPublicLeaderboardCacheKey(wallet: string | null): string {
  return normalizeWallet(wallet);
}

export function getCachedPublicLeaderboard(
  wallet: string | null,
): PublicLeaderboardResponse | null {
  const walletKey = normalizeWallet(wallet);
  const network = latestNetworkByWallet.get(walletKey);
  if (network) {
    return cache.get(networkCacheKey(network, walletKey))?.data ?? null;
  }

  if (walletKey === ANONYMOUS_WALLET_KEY) {
    return hydratePublicSessionSeed();
  }

  return null;
}

function getFreshCachedPublicLeaderboard(
  wallet: string | null,
): PublicLeaderboardResponse | null {
  const cached = getCachedPublicLeaderboard(wallet);
  if (!cached) return null;

  const walletKey = normalizeWallet(wallet);
  const network = latestNetworkByWallet.get(walletKey);
  if (!network) return null;
  const entry = cache.get(networkCacheKey(network, walletKey));
  if (!entry || Date.now() - entry.fetchedAt > FRESH_FOR_MS) return null;
  return entry.data;
}

function buildLeaderboardUrl(wallet: string | null): string {
  const normalized = wallet?.trim().toLowerCase() ?? '';
  if (!normalized) return '/api/leaderboard';
  const search = new URLSearchParams({ wallet: normalized });
  return `/api/leaderboard?${search.toString()}`;
}

function remember(
  wallet: string | null,
  data: PublicLeaderboardResponse,
): PublicLeaderboardResponse {
  const walletKey = normalizeWallet(wallet);
  latestNetworkByWallet.set(walletKey, data.network);
  cache.set(networkCacheKey(data.network, walletKey), {
    data,
    fetchedAt: Date.now(),
  });

  if (walletKey === ANONYMOUS_WALLET_KEY) {
    persistPublicSessionSeed(data);
  }

  return data;
}

export async function loadPublicLeaderboard(
  wallet: string | null,
  { force = false }: { force?: boolean } = {},
): Promise<PublicLeaderboardResponse> {
  if (!force) {
    const cached = getFreshCachedPublicLeaderboard(wallet);
    if (cached) return cached;
  }

  const requestKey = normalizeWallet(wallet);
  const existing = inFlight.get(requestKey);
  if (existing) return existing;

  const request = (async () => {
    const isPersonalized = requestKey !== ANONYMOUS_WALLET_KEY;
    const response = await fetch(buildLeaderboardUrl(wallet), {
      cache: isPersonalized ? 'no-store' : 'default',
    });
    const result = (await response.json()) as
      | PublicLeaderboardResponse
      | { error?: string };

    if (!response.ok) {
      throw new Error(
        'error' in result && result.error
          ? result.error
          : 'The leaderboard could not be loaded.',
      );
    }

    return remember(wallet, result as PublicLeaderboardResponse);
  })();

  inFlight.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (inFlight.get(requestKey) === request) {
      inFlight.delete(requestKey);
    }
  }
}

export async function prefetchPublicLeaderboard(
  wallet: string | null,
): Promise<PublicLeaderboardResponse> {
  return loadPublicLeaderboard(wallet);
}
