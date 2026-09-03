import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/lib/rateLimitServer.ts', import.meta.url),
  'utf8',
);

test('rate limiter retries only the reviewed transient JWT clock-skew error', () => {
  assert.match(source, /JWT_FUTURE_RETRY_MS = 750/);
  assert.match(source, /JWT issued at future/);
  assert.match(
    source,
    /if \(isJwtIssuedAtFutureError\(error\)\) \{[\s\S]*?await wait\(JWT_FUTURE_RETRY_MS\);[\s\S]*?await consume\(\)/,
  );
  assert.doesNotMatch(source, /for \([^)]*retry/i);
  assert.doesNotMatch(source, /while \([^)]*error/i);
});

test('all non-reviewed rate-limit failures remain fail-closed', () => {
  assert.match(
    source,
    /if \(error\) \{[\s\S]*?throw new Error\([\s\S]*?Rate limiter failed/,
  );
  assert.match(source, /RATE_LIMIT_UNAVAILABLE/);
  assert.match(source, /status: 503/);
});
