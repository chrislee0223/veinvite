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
  assert.match(
    source,
    /if \(\s*!retriableRead \|\|\s*!isTransientFetchFailure\(error\)\s*\) \{\s*throw error;\s*\}/s,
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
