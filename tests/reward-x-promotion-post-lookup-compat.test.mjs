import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/rewards/rewardXPromotionXApi.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const POST_ID = '1234567890';
const AUTHOR = '9876543210';
const DATE = '2026-10-21T01:02:03Z';
function setup({ legacyStatus = 200, modernStatus = 200, references = [], field = 'referenced_posts' } = {}) {
  const urls = [];
  const exports = {};
  const data = {
    id: POST_ID, author_id: AUTHOR, created_at: DATE,
    entities: { urls: [{ expanded_url: 'https://veinvite.vercel.app/s/ABCDEFGHIJKLMNOP?xp=aceceace-1234-4123-8123-123456789abc' }] },
    [field]: references,
  };
  vm.runInNewContext(compiled, {
    exports, URL, AbortController, Date, Array, Set, Buffer,
    setTimeout, clearTimeout,
    process: { env: { X_API_BEARER_TOKEN: 'test-only' } },
    require(id) { if (id === 'server-only') return {}; if(id==='@/lib/rewards/rewardXPromotionApiBudget') return { async reserveXApiReadBudget(kind){ assert.equal(kind,'POST_LOOKUP');return true; } };throw new Error(id); },
    fetch: async (value, options) => {
      const url = new URL(value);
      urls.push(url);
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      const modern = url.searchParams.has('post.fields');
      const status = modern ? modernStatus : legacyStatus;
      return {
        status, ok: status === 200,
        async json() { return { data }; },
      };
    },
  });
  return { lookup: () => exports.lookupXPromotionPost(POST_ID), urls };
}

test('successful legacy X lookup is unchanged with one request', async () => {
  const x = setup({ field: 'referenced_tweets' });
  const result = await x.lookup();
  assert.equal(result.status, 'FOUND');
  assert.equal(result.isOriginalPost, true);
  assert.equal(x.urls.length, 1);
  assert.equal(x.urls[0].searchParams.has('tweet.fields'), true);
});

test('400 fallback uses the current post.fields and author/reference expansions', async () => {
  const x = setup({ legacyStatus: 400 });
  const result = await x.lookup();
  assert.equal(result.status, 'FOUND');
  assert.equal(result.authorId, AUTHOR);
  assert.equal(x.urls.length, 2);
  assert.equal(x.urls[1].searchParams.has('tweet.fields'), false);
  assert.equal(x.urls[1].searchParams.get('post.fields'), 'created_at,entities');
  assert.equal(x.urls[1].searchParams.get('expansions'), 'author_id,referenced_posts');
});

test('new referenced_posts field correctly rejects quotes', async () => {
  const x = setup({ legacyStatus: 400, references: [{ id: '5555', type: 'quoted' }] });
  const result = await x.lookup();
  assert.equal(result.status, 'FOUND');
  assert.equal(result.isOriginalPost, false);
});

test('old referenced_tweets field still rejects retweets and quotes', async () => {
  const x = setup({ field: 'referenced_tweets', references: [{ id: '5555', type: 'quoted' }] });
  assert.equal((await x.lookup()).isOriginalPost, false);
});

test('401/429 do not trigger a paid fallback lookup', async () => {
  for (const status of [401, 429]) {
    const x = setup({ legacyStatus: status });
    const result = await x.lookup();
    assert.equal(result.status, 'RETRY');
    assert.equal(x.urls.length, 1);
  }
});

test('400 followed by another error fails closed', async () => {
  const x = setup({ legacyStatus: 400, modernStatus: 400 });
  const result = await x.lookup();
  assert.equal(result.status, 'RETRY');
  assert.equal(x.urls.length, 2);
});
