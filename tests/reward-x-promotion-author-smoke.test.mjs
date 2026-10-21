import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/rewards/rewardXPromotionAuthorSmoke.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function setup({
  date = new Date().toISOString().slice(0, 10), mode = 'off',
  rateLimit = null, status = 200, alternate = 200,
  posts = [{ id: '123' }],
} = {}) {
  const calls = { fetch: [], limiter: [] };
  const exports = {};
  const sandbox = {
    exports, URL, Date, AbortController, setTimeout, clearTimeout,
    console: { warn() {} },
    process: { env: {
      VEINVITE_X_AUTHOR_PROBE_UTC_DATE: date,
      VEINVITE_X_PROMOTION_DISCOVERY_MODE: mode,
      X_API_BEARER_TOKEN: 'fake-bearer',
    } },
    require(id) {
      if (id === 'server-only') return {};
      if (id === '@/lib/rateLimitServer') return {
        async enforceRateLimits(checks) {
          calls.limiter.push(checks[0]);
          assert.equal(checks[0].scope, 'x_promotion_author_probe_once');
          assert.equal(checks[0].windowSeconds, 86400);
          assert.equal(checks[0].limit, 1);
          return rateLimit;
        },
      };
      throw Error('Unexpected dependency: ' + id);
    },
    async fetch(input) {
      const u = new URL(String(input));
      assert.equal(u.pathname, '/2/users/2244994945/tweets');
      assert.equal(u.searchParams.get('max_results'), '5');
      const first = u.searchParams.has('post.fields');
      assert.equal(u.searchParams.get('exclude'), 'replies,retweets');
      calls.fetch.push(String(input));
      const s = first ? status : alternate;
      return { ok:s===200, status:s, async json(){return {data:posts};} };
    },
  };
  vm.runInNewContext(compiled, sandbox);
  return { result: await exports.runXAuthorTimelineSmokeOnce(), calls };
}

test('date flag OFF means no provider queries', async () => {
  const x=await setup({date:''});
  assert.equal(x.result.status,'SKIPPED');
  assert.equal(x.calls.fetch.length,0);
});

test('probe date expiry and auto-discovery live both suppress the probe', async () => {
  for(const opts of [{date:'2026-01-01'}, {mode:'live'}]){
    const x=await setup(opts);
    assert.equal(x.result.status,'SKIPPED');
    assert.equal(x.calls.fetch.length,0);
  }
});

test('database limiter permits only one bounded public X request per day', async () => {
  const x=await setup();
  assert.equal(x.result.status,'READY');
  assert.equal(x.result.posts,1);
  assert.equal(x.calls.fetch.length,1);
  assert.equal(x.calls.limiter.length,1);
});

test('a repeated probe skips provider entirely', async () => {
  const x=await setup({rateLimit:{status:429}});
  assert.equal(x.result.status,'ALREADY_RUN');
  assert.equal(x.calls.fetch.length,0);
});

test('provider HTTP 400 uses only one format fallback', async () => {
  const x=await setup({status:400,alternate:200});
  assert.equal(x.result.status,'READY');
  assert.equal(x.calls.fetch.length,2);
});

test('provider rejection never causes a Post or payout mutation', async () => {
  const x=await setup({status:403});
  assert.equal(x.result.status,'PROVIDER_UNAVAILABLE');
  assert.equal(x.calls.fetch.length,1);
  assert.doesNotMatch(source, /sendTransaction|record_reward_x_promotion_post_submission|runRewardXPromotionPayout/);
});
