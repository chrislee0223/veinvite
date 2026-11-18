'use client';

import type { PublicCountryArrivalResponse } from '@/lib/types';

// Country-wide public figures change slowly. This deliberately does not
// share the inviter, wallet, Network or reward-forecast cache lifetimes.
export const COUNTRY_CACHE_TTL_MS = 30 * 60_000;

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
