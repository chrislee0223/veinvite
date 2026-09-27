import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/lib/supabaseServer.ts', import.meta.url),
  'utf8',
);

test('transient Supabase retries remain limited to safe reads', () => {
  assert.match(source, /const RETRIABLE_READ_METHODS = new Set\(\[\s*'GET',\s*'HEAD',\s*\]\)/s);
  assert.match(
    source,
    /'\/rest\/v1\/rpc\/read_latest_reward_forecast_snapshot'/,
  );
  assert.match(
    source,
    /'\/rest\/v1\/rpc\/read_reward_forecast_history'/,
  );
  assert.match(source, /if \(method !== 'POST'\) \{\s*return false;\s*\}/s);
  assert.match(source, /url\.origin === configuredSupabaseOrigin/);
  assert.match(source, /RETRIABLE_READ_RPC_PATHS\.has\(url\.pathname\)/);

  assert.match(source, /TRANSIENT_FETCH_RETRY_DELAY_MS = 125/);
  assert.match(source, /error instanceof TypeError/);
  assert.match(source, /fetch failed/i);
  assert.match(source, /function isForecastReadTimeout/);
  assert.match(
    source,
    /error\.message ===\s*`Supabase forecast read exceeded \$\{FORECAST_READ_TIMEOUT_MS\}ms\.\`/s,
  );
  assert.match(
    source,
    /const boundedForecastRead =\s*isBoundedForecastReadRequest\(input, init\)/s,
  );
  assert.match(
    source,
    /isTransientFetchFailure\(error\) \|\|\s*\(boundedForecastRead &&\s*isForecastReadTimeout\(error\)\)/s,
  );
  assert.match(
    source,
    /if \(\s*!retriableRead \|\|\s*!retryableTransportFailure\s*\) \{\s*throw error;\s*\}/s,
  );
  assert.match(source, /await wait\(TRANSIENT_FETCH_RETRY_DELAY_MS\)/);

  assert.match(source, /body\.includes\('JWT issued at future'\)/);
  assert.match(source, /await wait\(JWT_FUTURE_RETRY_DELAY_MS\)/);

  assert.doesNotMatch(
    source,
    /RETRIABLE_READ_RPC_PATHS[^;]*\/rest\/v1\/rpc\/[^'\n]*write/i,
  );
  assert.doesNotMatch(
    source,
    /RETRIABLE_READ_RPC_PATHS[^;]*\/rest\/v1\/rpc\/[^'\n]*(?:insert|update|delete|create|claim|finalize|prepare|register|pause|queue)/i,
  );
});

test('reward forecast RPC reads are abort-bounded without widening mutation retries', () => {
  assert.match(source, /FORECAST_READ_TIMEOUT_MS = 5_000/);
  assert.match(source, /function isBoundedForecastReadRequest/);
  assert.match(
    source,
    /getRequestMethod\(input, init\) !== 'POST'/,
  );
  assert.match(source, /RETRIABLE_READ_RPC_PATHS\.has\(url\.pathname\)/);
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(
    source,
    /controller\.abort\([\s\S]*Supabase forecast read exceeded/,
  );
  assert.match(
    source,
    /signal: controller\.signal/,
  );
  assert.match(
    source,
    /upstreamSignal\?\.addEventListener\('abort', forwardAbort/,
  );
  assert.match(
    source,
    /upstreamSignal\?\.removeEventListener\('abort', forwardAbort\)/,
  );
  assert.match(
    source,
    /response = await fetchWithForecastReadTimeout\(input, init\)/,
  );
  assert.match(
    source,
    /return fetchWithForecastReadTimeout\(input, init\)/,
  );
  assert.doesNotMatch(
    source,
    /(?:claim|finalize|prepare|register|pause|queue)[^\n]*FORECAST_READ_TIMEOUT_MS/i,
  );
});
