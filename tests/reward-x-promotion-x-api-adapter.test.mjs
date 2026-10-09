import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adapter = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionXApi.ts',
    import.meta.url,
  ),
  'utf8',
);

const route = await readFile(
  new URL(
    '../src/app/api/rewards/x-promotion/submit/route.ts',
    import.meta.url,
  ),
  'utf8',
);

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009133000_add_x_promotion_submission_invalidation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('X lookup uses the official v2 Post lookup endpoint and required fields', () => {
  assert.match(
    adapter,
    /https:\/\/api\.x\.com\/2\/tweets\/\$\{postId\}/,
  );
  assert.match(adapter, /'post\.fields'/);
  assert.match(adapter, /'post\\.fields'/);
  assert.match(adapter, /'created_at'/);
  assert.match(adapter, /'entities'/);
  assert.match(adapter, /'expansions'/);
  assert.match(adapter, /'author_id'/);
  assert.match(adapter, /'referenced_posts'/);
});

test('missing credentials and transient X failures never become terminal invalidation', () => {
  assert.match(adapter, /X_API_NOT_CONFIGURED/);
  assert.match(adapter, /X_API_RATE_LIMITED/);
  assert.match(adapter, /X_API_UNAVAILABLE/);
  assert.match(route, /lookup\.status === 'RETRY'/);
  assert.match(route, /status: 202/);
});

test('author and referenced Post identity are requested as expansions', () => {
  const postFieldsStart = adapter.indexOf(
    "endpoint.searchParams.set(\n    'post.fields'",
  );
  const expansionsStart = adapter.indexOf(
    "endpoint.searchParams.set(\n    'expansions'",
  );

  assert.ok(postFieldsStart >= 0);
  assert.ok(expansionsStart > postFieldsStart);

  const postFieldsBlock = adapter.slice(
    postFieldsStart,
    expansionsStart,
  );
  assert.doesNotMatch(postFieldsBlock, /author_id/);
  assert.doesNotMatch(postFieldsBlock, /referenced_posts/);
});

test('submission is persisted before the external X lookup', () => {
  const recordIndex = route.indexOf(
    'record_reward_x_promotion_post_submission_v1',
  );
  const lookupIndex = route.indexOf(
    'lookupXPromotionPost',
  );

  assert.ok(recordIndex >= 0);
  assert.ok(lookupIndex > recordIndex);
});

test('wallet session and opportunity ownership gate the submission API', () => {
  assert.match(route, /requireWalletSession/);
  assert.match(route, /opportunity\.recipient_wallet\.toLowerCase\(\) !== wallet/);
  assert.match(route, /x_promotion_submit_wallet/);
  assert.match(route, /x_promotion_submit_invite/);
});

test('only original Posts with the unique VeInvite URL can pass initial verification', () => {
  assert.match(route, /!lookup\.isOriginalPost/);
  assert.match(route, /POST_NOT_ORIGINAL/);
  assert.match(route, /findVeInvitePromotionUrl/);
  assert.match(route, /SHARE_TOKEN_MISSING/);
});

test('terminal submission invalidation is narrow and does not release the reward obligation', () => {
  assert.match(
    migration,
    /old\.submission_state<>'PENDING'|submission_state<>'PENDING'/,
  );
  assert.match(migration, /submission_state='INVALID'/);
  assert.doesNotMatch(
    migration,
    /update public\.reward_x_promotion_obligations/i,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.reward_payouts/i,
  );
});

test('X API adapter does not expose credentials to the client', () => {
  assert.match(adapter, /process\.env\.X_API_BEARER_TOKEN/);
  assert.match(adapter, /import 'server-only'/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_X_API/i);
});
