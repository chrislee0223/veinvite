'use client';

import type { PublicCountryArrivalResponse } from '@/lib/types';

// Country-wide public figures change slowly. This deliberately does not
// share the inviter, wallet, Network or reward-forecast cache lifetimes.
export const COUNTRY_CACHE_TTL_MS = 30 * 60_000;

const COUNTRY_CACHE_STORAGE_KEY = 'veinvite_public_country_arrivals_v1';

function isSafeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

// Local storage is browser-controlled, so restore only a plausible public
// country response from this version. Never cache wallet-specific data.
function isCountryResponse(value: unknown): value is PublicCountryArrivalResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Partial<PublicCountryArrivalResponse>;
  if (
    typeof data.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.generatedAt)) ||
    !['mainnet', 'testnet', 'testnet-staging'].includes(String(data.network)) ||
    !isSafeCount(data.currentRoundId) ||
    !isSafeCount(data.knownCompleted) ||
    !isSafeCount(data.unknownCompleted) ||
    !Array.isArray(data.leaders) ||
    data.leaders.length > 101
  ) return false;

  const seen = new Set<string>();
  for (const row of data.leaders) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.countryCode !== 'string' ||
        !/^[A-Z]{2}$/.test(row.countryCode) ||
        seen.has(row.countryCode) ||
        !isSafeCount(row.rank) || row.rank === 0 ||
        !isSafeCount(row.completedReferrals) ||
        !isSafeCount(row.newUsers) ||
        !isSafeCount(row.returningUsers) ||
        row.newUsers + row.returningUsers !== row.completedReferrals ||
        !isSafeCount(row.currentRoundCompleted) ||
        (row.previousRank !== null &&
          (!isSafeCount(row.previousRank) || row.previousRank === 0)) ||
        (row.rankChange !== null && !Number.isSafeInteger(row.rankChange)) ||
        !['UP', 'DOWN', 'SAME', 'NEW', 'UNAVAILABLE'].includes(row.rankMovement)
    ) return false;
    seen.add(row.countryCode);
  }
  return true;
}

// Read only from click/observer effects, not during hydration. The initial
// server/client render must be identical even with a warm browser cache.
function restoreCountryCache(): CountryCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COUNTRY_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CountryCache>;
    if (!isCountryResponse(parsed?.data) ||
        typeof parsed.loadedAt !== 'number' ||
        !Number.isFinite(parsed.loadedAt)) {
      window.localStorage.removeItem(COUNTRY_CACHE_STORAGE_KEY);
      return null;
    }
    const now = Date.now();
    const generated = Date.parse(parsed.data.generatedAt);
    // Storage must never extend the server timestamp or a past round's TTL.
    if (generated > now + 60_000) return null;
    const loadedAt = Math.min(parsed.loadedAt, generated, now);
    if (now - loadedAt >= COUNTRY_CACHE_TTL_MS || now < loadedAt) {
      window.localStorage.removeItem(COUNTRY_CACHE_STORAGE_KEY);
      return null;
    }
    return { loadedAt, data: parsed.data };
  } catch {
    // Private browsing, a full storage quota, or corrupt cache must not
    // block navigation or the live country request.
    return null;
  }
}

function persistCountryCache(value: CountryCache): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COUNTRY_CACHE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // In-memory and CDN caches remain available if storage is blocked.
  }
}

type CountryCache = {
  loadedAt: number;
  data: PublicCountryArrivalResponse;
};

let countryCache: CountryCache | null = null;
let countryInFlight: Promise<PublicCountryArrivalResponse> | null = null;

export function getCachedCountryArrivals(): PublicCountryArrivalResponse | null {
  // Retain an expired snapshot for an uninterrupted visible-while-refreshing UI.
  return countryCache?.data ?? null;
}

export function getFreshCountryArrivals(): PublicCountryArrivalResponse | null {
  const restored = restoreCountryCache();
  if (restored && (!countryCache || restored.loadedAt > countryCache.loadedAt)) {
    countryCache = restored;
  }
  if (!countryCache) return null;
  const age = Date.now() - countryCache.loadedAt;
  return age >= 0 && age < COUNTRY_CACHE_TTL_MS
    ? countryCache.data
    : null;
}

async function fetchCountryArrivals(): Promise<PublicCountryArrivalResponse> {
  // No browser-level caching: the local 30m TTL handles tab changes; Vercel's
  // shared CDN caches this public API response separately across visitors.
  const response = await fetch('/api/leaderboard/country', {
    cache: 'default',
  });
  const result = (await response.json()) as
    | PublicCountryArrivalResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      'error' in result && result.error
        ? result.error
        : 'Country arrivals are temporarily unavailable.',
    );
  }

  return result as PublicCountryArrivalResponse;
}

export function loadCountryArrivals(
  force = false,
): Promise<PublicCountryArrivalResponse> {
  // Always dedupe a pending fetch, including an explicit retry, so rapid tab
  // changes cannot issue concurrent requests or write results out of order.
  if (countryInFlight) return countryInFlight;

  if (!force) {
    const fresh = getFreshCountryArrivals();
    if (fresh) return Promise.resolve(fresh);
  }

  const request = fetchCountryArrivals()
    .then((data) => {
      const now = Date.now();
      const generatedAt = Date.parse(data.generatedAt);
      // The CDN may have generated this response earlier. Anchor local
      // freshness to the response timestamp, not just the browser fetch time,
      // to avoid making the combined layers stale for nearly 60 minutes.
      countryCache = {
        loadedAt: Number.isFinite(generatedAt)
          ? Math.min(generatedAt, now)
          : now,
        data,
      };
      // This is public aggregate data; no wallet, inviter or session values.
      if (isCountryResponse(data) && generatedAt <= now + 60_000) {
        persistCountryCache(countryCache);
      }
      return data;
    })
    .finally(() => {
      if (countryInFlight === request) {
        countryInFlight = null;
      }
    });

  countryInFlight = request;
  return request;
}
