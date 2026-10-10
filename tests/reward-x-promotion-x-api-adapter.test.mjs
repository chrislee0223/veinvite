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

test('X lookup uses the official v2 Post lookup endpoint and tweet fields', () => {
  assert.match(
    adapter,
    /https:\/\/api\.x\.com\/2\/tweets\/\$\{postId\}/,
  );
  assert.match(adapter, /'tweet\.fields'/);
  assert.match(adapter, /'created_at'/);
  assert.match(adapter, /'entities'/);
  assert.match(adapter, /'author_id'/);
  assert.match(adapter, /'referenced_tweets'/);
  assert.doesNotMatch(adapter, /'post\.fields'/);
  assert.doesNotMatch(adapter, /referenced_posts/);
});

test('missing credentials and transient X failures never become terminal invalidation', () => {
  assert.match(adapter, /X_API_NOT_CONFIGURED/);
  assert.match(adapter, /X_API_RATE_LIMITED/);
  assert.match(adapter, /X_API_UNAVAILABLE/);
  assert.match(route, /lookup\.status === 'RETRY'/);
  assert.match(route, /status: 202/);
});

test('author and referenced Post identity use canonical Tweet fields', () => {
  const fieldsStart = adapter.indexOf(
    "endpoint.searchParams.set(\n    'tweet.fields'",
  );

  assert.ok(fieldsStart >= 0);
  const fieldsBlock = adapter.slice(
    fieldsStart,
    adapter.indexOf('const controller', fieldsStart),
  );

  assert.match(fieldsBlock, /author_id/);
  assert.match(fieldsBlock, /referenced_tweets/);
  assert.doesNotMatch(fieldsBlock, /referenced_posts/);
});

test('submission is persisted before the external X lookup', () => {
  const recordIndex = route.indexOf(
    'record_reward_x_promotion_post_submission_v1',
  );
  const lookupIndex = route.indexOf(
    'await lookupXPromotionPost(',
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

test('terminal verdict is not exposed unless invalidation persisted', () => {
  assert.match(route, /Promise<boolean>/);
  assert.match(route, /INVALIDATION_RETRY_REQUIRED/);
  assert.match(route, /if \(!invalidated\)/);
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


test('promotion URL matching requires the canonical referral path and exact xp token', () => {
  assert.match(adapter, /REFERRAL_KEY_PATTERN/);
  assert.match(adapter, /PROMOTION_TOKEN_PATTERN/);
  assert.match(adapter, /PROMOTION_QUERY_PARAM = 'xp'/);
  assert.match(adapter, /REFERRAL_KEY_PATTERN\.test\(match\[1\]\)/);
  assert.match(adapter, /url\.pathname/);
  assert.match(adapter, /searchParams\.getAll/);
  assert.match(adapter, /promotionTokens\.length !== 1/);
  assert.doesNotMatch(
    adapter,
    /url\.toString\(\)\.toLowerCase\(\)\.includes\(token\)/,
  );
});
