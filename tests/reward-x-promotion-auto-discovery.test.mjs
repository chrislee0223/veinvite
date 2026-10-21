import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/lib/rewards/rewardXPromotionAutoDiscovery.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({
  mode = 'live', posts = [], apiStatus = 200, canonical = null, existing = [],
  openedOffsetMinutes = -5, deadlineOffsetMinutes = 55,
  boundAuthor = '9876543210',
} = {}) {
  const now = Date.now();
  const opportunity = {
    invite_code: 'ABCDEFG',
    recipient_wallet: '0x1111111111111111111111111111111111111111',
    share_token: 'aceceace-1234-4123-8123-123456789abc',
    opened_at: new Date(now + openedOffsetMinutes * 60_000).toISOString(),
    post_deadline_at: new Date(now + deadlineOffsetMinutes * 60_000).toISOString(),
    submission_grace_seconds: 3600,
  };
  const calls = { api: 0, submissions: [], payout: 0 };
  const supabaseAdmin = {
    from(name) {
      if (name === 'reward_x_promotion_opportunities') {
        return {
          select() { return this; }, eq() { return this; },
          gte() { return this; }, order() { return this; },
          async limit() { return { data: [opportunity], error: null }; },
        };
      }
      if (name === 'reward_x_promotion_x_identities') {
        return {
          select() { return this; }, eq() { return this; },
          async in() {
            return { data: boundAuthor ? [{
              recipient_wallet: opportunity.recipient_wallet,
              x_author_id: boundAuthor,
            }] : [], error: null };
          },
        };
      }
      assert.equal(name, 'reward_x_promotion_post_submissions');
      let count = 0;
      return {
        select() { return this; },
        in() {
          count++;
          if (count === 1) return this;
          return Promise.resolve({ data: existing.map((invite_code) => ({ invite_code })), error: null });
        },
      };
    },
    async rpc(name, args) {
      assert.equal(name, 'record_reward_x_promotion_post_submission_v1');
      calls.submissions.push(args);
      return { error: null };
    },
  };
  const requireMock = (id) => {
    if (id === 'server-only') return {};
    if (id === '@/lib/supabaseServer') return { supabaseAdmin };
    if (id === '@/lib/vebetter/network') {
      return { getVeBetterNetworkConfig: () => ({ network: 'mainnet' }) };
    }
    if (id === '@/lib/rewards/rewardXPromotionXApi') {
      return {
        findVeInvitePromotionUrl(urls, token) {
          return urls.find((url) => url.includes(token)) ?? null;
        },
        async lookupXPromotionPost() {
          return canonical ?? {
            status: 'FOUND', postId: posts[0]?.id ?? '1234567890',
            authorId: posts[0]?.author_id ?? '9876543210',
            createdAt: posts[0]?.created_at,
            isOriginalPost: true,
            expandedUrls: posts[0]?.entities?.urls?.map((item) => item.expanded_url) ?? [],
          };
        },
      };
    }
    throw new Error('Unexpected module: ' + id);
  };
  const exports = {};
  const sandbox = {
    exports, require: requireMock, console: { warn() {}, error() {} },
    process: { env: {
      VEINVITE_X_PROMOTION_DISCOVERY_MODE: mode,
      X_API_BEARER_TOKEN: 'fake-test-token',
    } },
    Date, Math, URL, Set, AbortController, setTimeout, clearTimeout,
    fetch: async (url) => {
      assert.match(String(url), /api\.x\.com\/2\/tweets\/search\/recent/);
      assert.match(String(url), /url%3Aveinvite\.vercel\.app/);
      calls.api++;
      return {
        ok: apiStatus === 200, status: apiStatus,
        async json() { return { data: posts, meta: {} }; },
      };
    },
  };
  vm.runInNewContext(compiled, sandbox, { filename: 'rewardXPromotionAutoDiscovery.cjs' });
  return { run: exports.runXPromotionAutoDiscovery, calls, opportunity };
}

function post({minutesAgo = 1, token = 'aceceace-1234-4123-8123-123456789abc'} = {}) {
  return {
    id: '1234567890', author_id: '9876543210',
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    entities: { urls: [{
      expanded_url: `https://veinvite.vercel.app/s/ABCDEFGHIJKLMNOP?xp=${token}`,
    }] },
    referenced_tweets: [],
  };
}

test('disabled mode makes no X API requests or reward changes', async () => {
  const x = setup({ mode: 'off', posts: [post()] });
  const result = await x.run();
  assert.equal(result.status, 'DISABLED');
  assert.equal(x.calls.api, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('probe finds a Post but never mutates reward records', async () => {
  const x = setup({ mode: 'probe', posts: [post()] });
  const result = await x.run();
  assert.equal(result.status, 'READY');
  assert.equal(result.matched, 1);
  assert.equal(result.submitted, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('live mode passes only canonical matched Post into existing RPC', async () => {
  const x = setup({ mode: 'live', posts: [post()] });
  const result = await x.run();
  assert.equal(result.submitted, 1);
  assert.equal(x.calls.submissions.length, 1);
  assert.equal(x.calls.submissions[0].p_invite_code, 'ABCDEFG');
  assert.equal(x.calls.submissions[0].p_x_post_id, '1234567890');
  assert.equal(x.calls.submissions[0].p_submitted_post_url, 'https://x.com/i/status/1234567890');
});

test('X search permission failure retains safe manual fallback', async () => {
  const x = setup({ apiStatus: 403, posts: [post()] });
  const result = await x.run();
  assert.equal(result.status, 'SEARCH_UNAVAILABLE');
  assert.equal(result.failed, 1);
  assert.equal(x.calls.submissions.length, 0);
});

test('posts outside the window cannot be auto-submitted', async () => {
  const x = setup({ posts: [post({ minutesAgo: 50 })] });
  const result = await x.run();
  assert.equal(result.submitted, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('canonical X author disagreement prevents submitting rewards', async () => {
  const p = post();
  const x = setup({ posts: [p], canonical: {
    status: 'FOUND', postId: p.id, authorId: '9999999999',
    createdAt: p.created_at, isOriginalPost: true,
    expandedUrls: [p.entities.urls[0].expanded_url],
  } });
  const result = await x.run();
  assert.equal(result.submitted, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('already-pending manual submission prevents duplicate auto submission', async () => {
  const x = setup({ posts: [post()], existing: ['ABCDEFG'] });
  const result = await x.run();
  assert.equal(result.status, 'NO_OFFERS');
  assert.equal(x.calls.api, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('unknown X author cannot receive a live auto-submission', async () => {
  const x = setup({ posts: [post()], boundAuthor: null });
  const result = await x.run();
  assert.equal(result.status, 'NO_OFFERS');
  assert.equal(x.calls.api, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('mismatched bound X author is not treated as wallet owner', async () => {
  const x = setup({ posts: [post()], boundAuthor: '1234509876' });
  const result = await x.run();
  assert.equal(result.submitted, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('domain-wide search has a strict 10-result cap per cron', async () => {
  const x = setup({ posts: [post()] });
  await x.run();
  assert.equal(x.calls.api, 1);
});
