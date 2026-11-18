import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

let importSequence = 0;
async function isolatedCache() {
  importSequence += 1;
  return import(
    new URL(
      `../src/lib/countryLeaderboardClientCache.ts?case=${importSequence}`,
      import.meta.url,
    ).href
  );
}

function payload(nowMs, label = 'TR', generatedAtMs = nowMs) {
  return {
    generatedAt: new Date(generatedAtMs).toISOString(),
    network: 'mainnet',
    currentRoundId: 125,
    knownCompleted: 1,
    unknownCompleted: 0,
    leaders: [
      {
        rank: 1,
        countryCode: label,
        completedReferrals: 1,
        newUsers: 1,
        returningUsers: 0,
        currentRoundCompleted: 0,
        previousRank: 1,
        rankChange: 0,
        rankMovement: 'SAME',
      },
    ],
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('country leaderboard fetches only once per 30m while a visitor reopens the tab', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = Date.parse('2026-11-18T14:00:00Z');
  let requests = 0;
  try {
    Date.now = () => now;
    globalThis.fetch = async (path, init) => {
      assert.equal(path, '/api/leaderboard/country');
      assert.equal(init?.cache, 'default');
      requests += 1;
      return jsonResponse(payload(now));
    };
    const client = await isolatedCache();
    assert.equal(client.COUNTRY_CACHE_TTL_MS, 1_800_000);
    assert.equal(client.getCachedCountryArrivals(), null);
    assert.equal(requests, 0, 'the module must not fetch on import');

    const original = await client.loadCountryArrivals();
    assert.equal(requests, 1);
    assert.equal(client.getCachedCountryArrivals(), original);

    now += 29 * 60_000;
    assert.equal(await client.loadCountryArrivals(), original);
    assert.equal(requests, 1);

    now += 60_000;
    const next = await client.loadCountryArrivals();
    assert.equal(requests, 2);
    assert.notEqual(next, original);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test('simultaneous tab openings and forced retries share one outstanding request', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const now = Date.parse('2026-11-18T14:00:00Z');
  let requests = 0;
  let resolveRequest;
  try {
    Date.now = () => now;
    globalThis.fetch = async () => {
      requests += 1;
      return new Promise((resolve) => { resolveRequest = resolve; });
    };
    const client = await isolatedCache();
    const first = client.loadCountryArrivals();
    const second = client.loadCountryArrivals();
    const forced = client.loadCountryArrivals(true);
    assert.strictEqual(first, second);
    assert.strictEqual(first, forced);
    assert.equal(requests, 1);

    resolveRequest(jsonResponse(payload(now)));
    await Promise.all([first, second, forced]);
    assert.equal(requests, 1);
    assert.equal((await client.loadCountryArrivals()).leaders[0].countryCode, 'TR');
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test('stale data stays visible during revalidation and CDN age shortens local TTL', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = Date.parse('2026-11-18T14:00:00Z');
  let requests = 0;
  let resolveRequest;
  try {
    Date.now = () => now;
    globalThis.fetch = async () => {
      requests += 1;
      if (requests === 1) {
        return jsonResponse(payload(now, 'TR', now - 20 * 60_000));
      }
      return new Promise((resolve) => { resolveRequest = resolve; });
    };
    const client = await isolatedCache();
    const oldData = await client.loadCountryArrivals();
    assert.equal(requests, 1);

    now += 9 * 60_000;
    assert.equal(client.getFreshCountryArrivals(), oldData);

    now += 60_000;
    assert.equal(client.getFreshCountryArrivals(), null);
    const refreshing = client.loadCountryArrivals();
    assert.equal(requests, 2);
    assert.equal(client.getCachedCountryArrivals(), oldData);

    resolveRequest(jsonResponse(payload(now, 'RO')));
    const refreshed = await refreshing;
    assert.equal(refreshed.leaders[0].countryCode, 'RO');
    assert.equal(client.getCachedCountryArrivals(), refreshed);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test('temporary API errors are not cached and stale country data is retained', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const now = Date.parse('2026-11-18T14:00:00Z');
  let requests = 0;
  try {
    Date.now = () => now;
    globalThis.fetch = async () => {
      requests += 1;
      return requests === 2
        ? jsonResponse({ error: 'temporary' }, 503)
        : jsonResponse(payload(now, 'TR'));
    };
    const client = await isolatedCache();
    const data = await client.loadCountryArrivals();
    await assert.rejects(client.loadCountryArrivals(true), /temporary/);
    assert.equal(client.getCachedCountryArrivals(), data);
    await client.loadCountryArrivals(true);
    assert.equal(requests, 3);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test('country-only 30m CDN policy never caches errors or merges other feature refreshes', () => {
  const route = readFileSync(
    new URL('../src/app/api/leaderboard/country/route.ts', import.meta.url), 'utf8',
  );
  const hub = readFileSync(
    new URL('../src/components/PublicLeaderboardHub.tsx', import.meta.url), 'utf8',
  );
  const forecast = readFileSync(
    new URL('../src/components/PublicRewardForecastCard.tsx', import.meta.url), 'utf8',
  );
  const network = readFileSync(
    new URL('../src/lib/networkSummaryClientCache.ts', import.meta.url), 'utf8',
  );

  assert.match(route, /'Vercel-CDN-Cache-Control': 'public, s-maxage=1800'/);
  assert.match(route, /'Cache-Control': 'public, max-age=0, must-revalidate'/);
  assert.match(route, /status: 503,[\s\S]*'Cache-Control': 'no-store'/);
  assert.match(hub, /const openCountry = useCallback\([\s\S]*?refreshCountry\(false\)/);
  assert.doesNotMatch(hub, /useEffect\(\(\) => \{\s*refreshCountry\(false\)/);
  assert.match(hub, /getCachedCountryArrivals\(\)/);
  assert.match(forecast, /CLIENT_FORECAST_CACHE_MS = 15 \* 60_000/);
  assert.match(network, /MEMORY_TTL_MS = 15_000/);
});


test('a public country result survives reload within 30 minutes without startup fetches', async () => {
  const oldWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const store = new Map();
  const localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
    removeItem: (key) => { store.delete(key); },
  };
  let now = Date.parse('2026-11-19T00:00:00Z');
  let requests = 0;
  try {
    globalThis.window = { localStorage };
    Date.now = () => now;
    globalThis.fetch = async () => {
      requests++;
      return jsonResponse(payload(now));
    };

    const visit1 = await isolatedCache();
    assert.equal(visit1.getCachedCountryArrivals(), null);
    assert.equal(requests, 0, 'initial render/import never prefetches country data');
    const initial = await visit1.loadCountryArrivals();
    assert.equal(requests, 1);
    assert.equal(initial.leaders[0].countryCode, 'TR');
    assert.equal(store.size, 1, 'only the public country response is persisted');

    now += 10 * 60_000;
    const visit2 = await isolatedCache();
    assert.equal(visit2.getCachedCountryArrivals(), null,
      'hydration must not read browser storage during render');
    const restored = visit2.getFreshCountryArrivals();
    assert.equal(restored?.leaders[0].countryCode, 'TR');
    assert.equal(await visit2.loadCountryArrivals(), restored);
    assert.equal(requests, 1, 'restoring a valid country result performs no network call');

    now += 21 * 60_000;
    assert.equal(visit2.getFreshCountryArrivals(), null,
      'an expired country snapshot must never pretend to be fresh');
    await visit2.loadCountryArrivals();
    assert.equal(requests, 2, 'expired data is requested again on demand');
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});

test('corrupt browser storage fails closed without breaking the ranking tab', async () => {
  const oldWindow = globalThis.window;
  const oldFetch = globalThis.fetch;
  const originalNow = Date.now;
  const store = new Map([[
    'veinvite_public_country_arrivals_v1',
    JSON.stringify({ loadedAt: Date.parse('2026-11-19T00:00:00Z'),
      data: { ...payload(Date.parse('2026-11-19T00:00:00Z')), leaders: [{ countryCode: 'BAD' }] } }),
  ]]);
  let requests = 0;
  try {
    const now = Date.parse('2026-11-19T00:01:00Z');
    Date.now = () => now;
    globalThis.window = { localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: key => store.delete(key),
    } };
    globalThis.fetch = async () => { requests++; return jsonResponse(payload(now)); };
    const client = await isolatedCache();
    assert.equal(client.getFreshCountryArrivals(), null);
    assert.equal(store.size, 0, 'invalid data is removed');
    const result = await client.loadCountryArrivals();
    assert.equal(result.leaders[0].countryCode, 'TR');
    assert.equal(requests, 1);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = oldFetch;
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});

test('country tab anticipates intent only when visible and never joins app bootstrap', () => {
  const hub = readFileSync(
    new URL('../src/components/PublicLeaderboardHub.tsx', import.meta.url), 'utf8',
  );
  const cache = readFileSync(
    new URL('../src/lib/countryLeaderboardClientCache.ts', import.meta.url), 'utf8',
  );

  assert.match(hub, /new IntersectionObserver/);
  assert.match(hub, /observer\.observe\(countryTab\)/);
  assert.match(hub, /ref=\{countryTabRef\}/);
  assert.match(hub, /onPointerEnter=\{primeCountry\}/);
  assert.match(hub, /onFocus=\{primeCountry\}/);
  assert.match(hub, /requestIdleCallback\(start, \{ timeout: 1500 \}\)/);
  assert.match(hub, /rootMargin: '100px 0px'/);
  assert.match(cache, /restoreCountryCache\(\)/);
  assert.match(cache, /window\.localStorage\.setItem/);
  assert.match(cache, /COUNTRY_CACHE_TTL_MS = 30 \* 60_000/);
  assert.match(hub, /setRankingView\('country'\)/);
});
