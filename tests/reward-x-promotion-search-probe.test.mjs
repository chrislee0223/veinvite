import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/lib/rewards/rewardXPromotionSearchProbe.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function run({
  date = new Date().toISOString().slice(0, 10),
  discoveryMode = 'off',
  limitResponse = null,
  searchResult = { posts: [{ id: '123' }], truncated: false },
} = {}) {
  const calls = { limiter: 0, search: 0 };
  const exports = {};
  const sandbox = {
    exports, Date,
    process: { env: {
      VEINVITE_X_PROMOTION_SEARCH_PROBE_UTC_DATE: date,
      VEINVITE_X_PROMOTION_DISCOVERY_MODE: discoveryMode,
    } },
    require(name) {
      if (name === 'server-only') return {};
      if (name === '@/lib/rateLimitServer') {
        return { async enforceRateLimits(checks) {
          calls.limiter++;
          assert.equal(checks[0].limit, 1);
          assert.equal(checks[0].windowSeconds, 86400);
          assert.match(checks[0].subject, /veinvite-x-search-probe-/);
          return limitResponse;
        } };
      }
      if (name === '@/lib/rewards/rewardXPromotionAutoDiscovery') {
        return { async searchRecentPosts() {
          calls.search++;
          return searchResult;
        } };
      }
      throw new Error('Unexpected import: ' + name);
    },
  };
  vm.runInNewContext(compiled, sandbox);
  const result = await exports.runXPromotionSearchProbeOnce();
  return { result, calls };
}

test('off until an explicit UTC date is configured', async () => {
  const x = await run({ date: '' });
  assert.equal(x.result.status, 'SKIPPED');
  assert.equal(x.calls.limiter, 0);
  assert.equal(x.calls.search, 0);
});

test('an expired/future probe date cannot run X requests', async () => {
  const x = await run({ date: '2026-01-01' });
  assert.equal(x.result.status, 'SKIPPED');
  assert.equal(x.calls.search, 0);
});

test('search probing refuses to run while paid discovery is live', async () => {
  const x = await run({ discoveryMode: 'live' });
  assert.equal(x.result.status, 'SKIPPED');
  assert.equal(x.calls.search, 0);
});

test('shared rate limiter prevents second API charge on the same date', async () => {
  const x = await run({ limitResponse: { status: 429 } });
  assert.equal(x.result.status, 'ALREADY_RUN');
  assert.equal(x.calls.limiter, 1);
  assert.equal(x.calls.search, 0);
});

test('rate limiter outage fails closed', async () => {
  const x = await run({ limitResponse: { status: 503 } });
  assert.equal(x.result.status, 'BLOCKED');
  assert.equal(x.calls.search, 0);
});

test('one bounded probe reports only status and number of search hits', async () => {
  const x = await run();
  assert.equal(x.result.status, 'SEARCH_OK');
  assert.equal(x.result.searchPosts, 1);
  assert.equal(x.calls.search, 1);
});

test('X permission/search failure cannot make any submissions', async () => {
  const x = await run({ searchResult: null });
  assert.equal(x.result.status, 'SEARCH_UNAVAILABLE');
  assert.equal(x.calls.search, 1);
  assert.equal(x.calls.limiter, 1);
});

test('probe has no direct payout or submission path', () => {
  assert.doesNotMatch(source, /record_reward_x_promotion_post_submission_v1|runRewardXPromotionPayout|sendTransaction/);
});
