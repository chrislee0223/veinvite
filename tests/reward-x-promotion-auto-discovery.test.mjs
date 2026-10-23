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
  mode = 'live', posts = [], apiStatus = 200, alternateStatus = null, canonical = null, existing = [],
  openedOffsetMinutes = -5, deadlineOffsetMinutes = 55,
  boundAuthor = '9876543210', strategy = 'author',
  authorResult = null, fairEnabled = false, hints = [], additionalOffers = [],
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
  const calls = { api: 0, author: 0, authorIds: [], submissions: [], payout: 0, hintsRead: 0, hintsUpdated: [], checkpointsInserted: [] };
  const supabaseAdmin = {
    from(name) {
      if (name === 'reward_x_promotion_scan_requests') {
        return {
          select() { calls.hintsRead++; return this; },
          eq() { return this; },
          async in() { return { data: hints, error: null }; },
          async upsert(rows, options) {
            assert.equal(options.onConflict, 'invite_code');
            assert.equal(options.ignoreDuplicates, true);
            calls.checkpointsInserted.push(...rows);
            return { error: null };
          },
          update(data) {
            return {
              eq() { return this; },
              async in(_key, codes) {
                calls.hintsUpdated.push({ data, codes });
                return { error: null };
              },
            };
          },
        };
      }
      if (name === 'reward_x_promotion_opportunities') {
        return {
          select() { return this; }, eq() { return this; },
          gte() { return this; }, order() { return this; },
          async limit() { return { data: [opportunity, ...additionalOffers], error: null }; },
        };
      }
      if (name === 'reward_x_promotion_oauth_proofs') {
        return {
          select() { return this; }, eq() { return this; },
          async in() {
            return { data: [
              ...(boundAuthor ? [{ recipient_wallet: opportunity.recipient_wallet, x_author_id: boundAuthor }] : []),
              ...additionalOffers.map((item, index) => ({
                recipient_wallet: item.recipient_wallet,
                x_author_id: String(9876543220 + index),
              })),
            ], error: null };
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
    if (id === '@/lib/rewards/rewardXPromotionAuthorTimeline') {
      return { async readBoundAuthorPosts(authorId) {
        calls.author++;
        calls.authorIds.push(authorId);
        return authorResult ?? (
          apiStatus === 200
            ? { status: 'READY', posts, truncated: false }
            : { status: 'UNAVAILABLE', posts: [], truncated: false }
        );
      } };
    }
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
      VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY: strategy,
      VEINVITE_X_PROMOTION_DAILY_READ_CALLS: '6',
      VEINVITE_X_PROMOTION_FAIR_SCAN_ENABLED: fairEnabled ? 'true' : 'false',
      X_API_BEARER_TOKEN: 'fake-test-token',
    } },
    Date, Math, URL, Set, AbortController, setTimeout, clearTimeout,
    fetch: async (url) => {
      assert.match(String(url), /api\.x\.com\/2\/tweets\/search\/recent/);
      assert.match(String(url), /url%3Aveinvite\.vercel\.app/);
      const query = new URL(String(url)).searchParams;
      const isPrimary = query.has('tweet.fields');
      if (isPrimary) {
        assert.equal(query.get('tweet.fields'), 'created_at,entities,author_id,referenced_tweets');
        assert.equal(query.has('post.fields'), false);
      } else {
        assert.equal(query.get('post.fields'), 'created_at,entities,author_id,referenced_posts');
        assert.equal(query.get('expansions'), 'author_id,referenced_posts');
      }
      assert.equal(query.get('max_results'), '10');
      calls.api++;
      const status = isPrimary ? apiStatus : (alternateStatus ?? apiStatus);
      return {
        ok: status === 200, status,
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

test('OAuth-author strategy never incurs a broad paid domain search', async () => {
  const x = setup({ posts: [post()] });
  await x.run();
  assert.equal(x.calls.author, 1);
  assert.equal(x.calls.api, 0);
});

test('quoted or referenced Post cannot receive automatic reward', async () => {
  const p = post();
  p.referenced_posts = [{ id: '7777777', type: 'quoted' }];
  const x = setup({ posts: [p] });
  const result = await x.run();
  assert.equal(result.submitted, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('legacy manually submitted X identity without OAuth proof cannot auto qualify', async () => {
  // This mock intentionally exposes zero provider OAuth proofs, even if a
  // separate manual URL verification may have bound an author elsewhere.
  const x = setup({ posts: [post()], boundAuthor: null });
  const outcome = await x.run();
  assert.equal(outcome.submitted, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('read-only domain probe retries field format on HTTP 400', async () => {
  const x = setup({ mode: 'probe', apiStatus: 400, alternateStatus: 200, posts: [post()] });
  const result = await x.run();
  assert.equal(result.status, 'READY');
  assert.equal(x.calls.api, 2);
  assert.equal(result.matched, 1);
  assert.equal(result.submitted, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('HTTP 400 from both provider field formats fails closed without payout or submission', async () => {
  const x = setup({ mode: 'probe', apiStatus: 400, alternateStatus: 400, posts: [post()] });
  const result = await x.run();
  assert.equal(result.status, 'SEARCH_UNAVAILABLE');
  assert.equal(x.calls.api, 2);
  assert.equal(x.calls.submissions.length, 0);
  assert.equal(x.calls.payout, 0);
});

test('HTTP 429 never triggers field-format retry or a reward', async () => {
  const x = setup({ mode: 'probe', apiStatus: 429, posts: [post()] });
  const result = await x.run();
  assert.equal(result.status, 'SEARCH_UNAVAILABLE');
  assert.equal(x.calls.api, 1);
  assert.equal(x.calls.submissions.length, 0);
});

test('missing X author ID cannot be used as a linked-account proof', async () => {
  const p = post();
  delete p.author_id;
  const x = setup({ posts: [p] });
  const result = await x.run();
  assert.equal(result.submitted, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('author strategy reads only a verified X author timeline, not a domain search', async () => {
  const p = post();
  const x = setup({ posts: [p], strategy: 'author' });
  const result = await x.run();
  assert.equal(result.status, 'READY');
  assert.equal(result.submitted, 1);
  assert.equal(x.calls.author, 1);
  assert.equal(x.calls.api, 0);
  assert.equal(x.calls.submissions.length, 1);
});

test('author strategy never queries unbound wallets or authors', async () => {
  const x = setup({ posts: [post()], strategy: 'author', boundAuthor: null });
  const result = await x.run();
  assert.equal(result.status, 'NO_OFFERS');
  assert.equal(x.calls.author, 0);
  assert.equal(x.calls.api, 0);
});

test('author discovery daily budget block never falls back to broad paid search', async () => {
  const x = setup({
    posts: [post()], strategy: 'author',
    authorResult: { status: 'BUDGET_LIMIT', posts: [], truncated: false },
  });
  const result = await x.run();
  assert.equal(result.status, 'BUDGET_LIMIT');
  assert.equal(x.calls.api, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('author timeline result truncation is diagnosed without false verification', async () => {
  const x = setup({
    posts: [], strategy: 'author',
    authorResult: { status: 'READY', posts: [], truncated: true },
  });
  const result = await x.run();
  assert.equal(result.status, 'QUERY_INCOMPLETE');
  assert.equal(result.truncated, true);
  assert.equal(x.calls.submissions.length, 0);
});

test('live mode cannot run paid scans without author strategy', async () => {
  const x = setup({ posts: [post()], strategy: '' });
  const result = await x.run();
  assert.equal(result.status, 'DISABLED');
  assert.equal(x.calls.api, 0);
  assert.equal(x.calls.author, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('connected user is scheduled automatically without any posted button', async () => {
  const x = setup({ posts: [post()], fairEnabled: true });
  const result = await x.run();
  assert.equal(result.submitted, 1);
  assert.equal(x.calls.hintsRead, 1);
  assert.equal(x.calls.checkpointsInserted.length, 1);
  assert.equal(x.calls.checkpointsInserted[0].invite_code, 'ABCDEFG');
  assert.equal(x.calls.hintsUpdated.length, 1);
  assert.equal(x.calls.hintsUpdated[0].codes[0], 'ABCDEFG');
  assert.ok(x.calls.hintsUpdated[0].data.last_checked_at);
  assert.equal(x.calls.payout, 0);
});

test('X budget exhaustion never advances automatic scan checkpoints', async () => {
  const x = setup({
    fairEnabled: true,
    hints: [{ invite_code: 'ABCDEFG', requested_at: new Date().toISOString(), last_checked_at: null }],
    authorResult: { status:'BUDGET_LIMIT', posts: [], truncated:false },
  });
  const result = await x.run();
  assert.equal(result.status, 'BUDGET_LIMIT');
  assert.equal(x.calls.hintsUpdated.length, 0);
  assert.equal(x.calls.submissions.length, 0);
});

test('legacy discovery never reads automatic checkpoints when rollout is disabled', async () => {
  const x = setup({ fairEnabled: false });
  await x.run();
  assert.equal(x.calls.hintsRead, 0);
});

test('unscanned connected users are automatically checked ahead of recently attempted authors', async () => {
  const now=Date.now();
  const create=(code, walletDigit, deadlineOffset) => ({
    invite_code:code,
    recipient_wallet:'0x'+walletDigit.repeat(40),
    share_token:'aceceace-1234-4123-8123-123456789abc',
    opened_at:new Date(now-5*60_000).toISOString(),
    post_deadline_at:new Date(now+deadlineOffset*60_000).toISOString(),
    submission_grace_seconds:900,
  });
  const b=create('BCDEFGH','2',20);
  const c=create('CDEFGHJ','3',10);
  const checked=new Date(now-60*60_000).toISOString();
  const x=setup({
    fairEnabled:true, additionalOffers:[b,c],
    hints:[
      {invite_code:'ABCDEFG',requested_at:checked,last_checked_at:checked},
      {invite_code:'BCDEFGH',requested_at:checked,last_checked_at:null},
    ],
  });
  const result=await x.run();
  assert.equal(result.status,'READY');
  assert.deepEqual(x.calls.authorIds, ['9876543221','9876543220','9876543210']);
  assert.equal(x.calls.hintsUpdated.length,3);
  assert.equal(x.calls.payout,0);
});


test('author cooldown cannot falsely advance an automatic scan checkpoint', async () => {
  const prior = new Date(Date.now() - 3_600_000).toISOString();
  const x = setup({
    fairEnabled: true,
    hints: [{ invite_code: 'ABCDEFG', last_checked_at: prior }],
    authorResult: { status: 'COOLDOWN', posts: [], truncated: false },
  });
  const result = await x.run();
  assert.equal(result.checked, false);
  assert.equal(result.submitted, 0);
  assert.equal(x.calls.hintsUpdated.length, 0);
  assert.equal(x.calls.checkpointsInserted.length, 0);
  assert.equal(x.calls.payout, 0);
});

test('provider-unavailable author attempt still rotates without authorizing rewards', async () => {
  const x = setup({
    fairEnabled: true,
    authorResult: { status: 'UNAVAILABLE', posts: [], truncated: false },
  });
  const result = await x.run();
  assert.equal(result.submitted, 0);
  assert.equal(x.calls.hintsUpdated.length, 1);
  assert.equal(x.calls.payout, 0);
});
