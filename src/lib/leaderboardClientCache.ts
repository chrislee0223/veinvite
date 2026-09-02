'use client';

import type { PublicLeaderboardResponse } from '@/lib/types';

const FRESH_FOR_MS = 30_000;
const ANONYMOUS_WALLET_KEY = 'anonymous';

type CacheEntry = {
  data: PublicLeaderboardResponse;
  fetchedAt: number;
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

export function getPublicLeaderboardCacheKey(wallet: string | null): string {
  return normalizeWallet(wallet);
}

export function getCachedPublicLeaderboard(
  wallet: string | null,
): PublicLeaderboardResponse | null {
  const walletKey = normalizeWallet(wallet);
  const network = latestNetworkByWallet.get(walletKey);
  if (!network) return null;
  return cache.get(networkCacheKey(network, walletKey))?.data ?? null;
}

function getFreshCachedPublicLeaderboard(
  wallet: string | null,
): PublicLeaderboardResponse | null {
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
    const response = await fetch(buildLeaderboardUrl(wallet), {
      cache: 'no-store',
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
): Promise<void> {
  await loadPublicLeaderboard(wallet).then(() => undefined);
}
