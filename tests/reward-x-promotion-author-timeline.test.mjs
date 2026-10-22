import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/lib/rewards/rewardXPromotionAuthorTimeline.ts', import.meta.url), 'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({
  mode = 'live', strategy = 'author', limit = '6', cooldown = null, budget = null,
  firstStatus = 200, alternateStatus = 200,
  body = { data: [{ id: '101', created_at: new Date().toISOString(), entities: { urls: [] } }], meta: {} },
} = {}) {
  const calls = { api: [], limits: [] };
  const exports = {};
  const sandbox = {
    exports, Date, URL, Number, AbortController, setTimeout, clearTimeout,
    process: { env: {
      VEINVITE_X_PROMOTION_DISCOVERY_MODE: mode,
      VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY: strategy,
      VEINVITE_X_PROMOTION_DAILY_READ_CALLS: limit,
      X_API_BEARER_TOKEN: 'fake-token',
    } },
    require(id) {
      if (id === 'server-only') return {};
      if (id === '@/lib/rewards/rewardXPromotionApiBudget') return {
        async reserveXApiReadBudget(kind) { assert.equal(kind,'TIMELINE'); return true; },
      };
      if (id === '@/lib/rateLimitServer') return {
        async enforceRateLimits(checks) {
          const check = checks[0];
          calls.limits.push(check);
          if (check.scope === 'x_promotion_author_cooldown') return cooldown;
          if (check.scope === 'x_promotion_daily_reads') return budget;
          throw new Error('Unrecognized limiter');
        },
      };
      throw new Error('Bad mock dependency ' + id);
    },
    async fetch(url) {
      const p = new URL(String(url));
      assert.match(p.pathname, /^\/2\/users\/9876543210\/tweets$/);
      assert.equal(p.searchParams.get('max_results'), '10');
      assert.equal(p.searchParams.get('exclude'), 'replies,retweets');
      const isPrimary = p.searchParams.has('post.fields');
      if (isPrimary) {
        assert.equal(p.searchParams.get('post.fields'), 'created_at,entities');
        assert.equal(p.searchParams.get('expansions'), 'author_id,referenced_posts');
      } else {
        assert.equal(p.searchParams.get('tweet.fields'), 'created_at,entities,author_id,referenced_tweets');
      }
      calls.api.push(String(url));
      const status = isPrimary ? firstStatus : alternateStatus;
      return { ok: status === 200, status, async json() { return body; } };
    },
  };
  vm.runInNewContext(compiled, sandbox, { filename: 'rewardXPromotionAuthorTimeline.cjs' });
  const read = () => exports.readBoundAuthorPosts('9876543210', new Date(Date.now() - 30_000).toISOString());
  return { read, calls };
}

test('author lookup uses a bounded public timeline and attested author id', async () => {
  const x = setup();
  const result = await x.read();
  assert.equal(result.status, 'READY');
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].author_id, '9876543210');
  assert.equal(x.calls.api.length, 1);
  assert.equal(x.calls.limits.length, 2);
  assert.equal(x.calls.limits[0].windowSeconds, 3600);
  assert.equal(x.calls.limits[1].windowSeconds, 86400);
  assert.equal(x.calls.limits[1].limit, 6);
});

test('paid timeline cannot run when explicitly disabled or daily budget is missing', async () => {
  for (const opts of [{mode:'off'}, {strategy:'broad'}, {limit:''}, {limit:'21'}]) {
    const x = setup(opts);
    assert.equal((await x.read()).status, 'DISABLED');
    assert.equal(x.calls.api.length, 0);
  }
});

test('same X author cooldown suppresses repeated API reads', async () => {
  const x = setup({cooldown:{status:429}});
  assert.equal((await x.read()).status, 'COOLDOWN');
  assert.equal(x.calls.api.length, 0);
  assert.equal(x.calls.limits.length, 1);
});

test('global daily rate limit stops provider reads entirely', async () => {
  const x = setup({budget:{status:429}});
  assert.equal((await x.read()).status, 'BUDGET_LIMIT');
  assert.equal(x.calls.api.length, 0);
});

test('database rate-limit outage fails closed', async () => {
  const x = setup({budget:{status:503}});
  assert.equal((await x.read()).status, 'UNAVAILABLE');
  assert.equal(x.calls.api.length, 0);
});

test('HTTP 400 field mismatch retries once but never broad-searches users', async () => {
  const x = setup({firstStatus:400,alternateStatus:200});
  assert.equal((await x.read()).status, 'READY');
  assert.equal(x.calls.api.length, 2);
});

test('429 and 403 never trigger alternate requests', async () => {
  for (const status of [403,429]) {
    const x = setup({firstStatus:status});
    assert.equal((await x.read()).status, 'UNAVAILABLE');
    assert.equal(x.calls.api.length, 1);
  }
});

test('X timeline author mismatch cannot be accepted', async () => {
  const x = setup({body:{data:[{id:'101',author_id:'666666',created_at:new Date().toISOString()}]}});
  const r = await x.read();
  assert.equal(r.status, 'READY');
  assert.equal(r.posts.length, 0);
});

test('pagination reports incomplete author coverage', async () => {
  const x = setup({body:{data:[],meta:{next_token:'another-page'}}});
  const r = await x.read();
  assert.equal(r.truncated,true);
  assert.equal(x.calls.api.length,1);
});
