import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [adapter, discovery, lifecycle, externalReadiness, retryMigration, invalidationMigration] =
  await Promise.all([
    read('src/lib/rewards/rewardXPromotionXApi.ts'),
    read('src/lib/rewards/rewardXPromotionAutoDiscovery.ts'),
    read('src/lib/rewards/rewardXPromotionLifecycle.ts'),
    read('src/lib/rewards/rewardXPromotionExternalReadiness.ts'),
    read('supabase/migrations/20261009142000_add_x_promotion_lifecycle_maintenance_v1.sql'),
    read('supabase/migrations/20261009133000_add_x_promotion_submission_invalidation_v1.sql'),
  ]);

test('X adapter retries Tweet/Post field incompatibilities without relaxing authenticity', () => {
  assert.match(adapter, /https:\/\/api\.x\.com\/2\/tweets\/\$\{postId\}/);
  assert.match(adapter, /'tweet\.fields'/);
  assert.match(adapter, /'created_at'/);
  assert.match(adapter, /'author_id'/);
  assert.match(adapter, /'referenced_tweets'/);
  assert.match(adapter, /response\.status === 400/);
  assert.match(adapter, /searchParams\.delete\('tweet\.fields'\)/);
  assert.match(adapter, /'post\.fields'/);
  assert.match(adapter, /referenced_posts/);
});

test('missing credentials and transient provider failures are retried, not counted as fraud', () => {
  for (const reason of ['X_API_NOT_CONFIGURED', 'X_API_RATE_LIMITED', 'X_API_UNAVAILABLE']) {
    assert.ok(adapter.includes(reason));
  }
  assert.match(lifecycle, /lookup\.status === 'RETRY'/);
  assert.match(lifecycle, /return 'RETRY'/);
});

test('adapter diagnostics remain coarse and never leak provider credentials', () => {
  assert.match(adapter, /httpStatus\?: number/);
  assert.match(adapter, /httpStatus: response\.status/);
  assert.match(externalReadiness, /lookupReason/);
  assert.match(externalReadiness, /httpStatus/);
  assert.doesNotMatch(externalReadiness, /Authorization|X_API_BEARER_TOKEN/);
  assert.match(adapter, /import 'server-only'/);
});

test('automatic author discovery checks ownership and canonical evidence before durable submission', () => {
  const checked = discovery.indexOf('const canonical = await lookupXPromotionPost(');
  const persisted = discovery.indexOf("'record_reward_x_promotion_post_submission_v1'");
  assert.ok(checked >= 0 && persisted > checked);
  assert.match(discovery, /boundAuthors\.get\(opportunity\.recipient_wallet\.toLowerCase\(\)\) !== post\.author_id/);
  assert.match(discovery, /canonical\.status !== 'FOUND' \|\| !canonical\.isOriginalPost/);
  assert.match(discovery, /canonical\.authorId !== post\.author_id/);
  assert.match(discovery, /findVeInvitePromotionUrl\(canonical\.expandedUrls/);
});

test('auto-scanning is bounded and never directly pays or releases X bonus liability', () => {
  assert.match(discovery, /VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY/);
  assert.match(discovery, /VEINVITE_X_PROMOTION_DAILY_READ_CALLS/);
  assert.match(discovery, /alreadySubmitted/);
  assert.doesNotMatch(discovery, /finalize_reward_x_promotion_payout_v1|sendTransaction\(/);
  assert.match(lifecycle, /record_reward_x_promotion_initial_post_verification_v2/);
  assert.match(lifecycle, /finalize_reward_x_promotion_post_verification_v2/);
});

test('initial and final checks still reject altered authors, Posts, and share tokens', () => {
  assert.match(lifecycle, /!lookup\.isOriginalPost/);
  assert.match(lifecycle, /POST_NOT_ORIGINAL/);
  assert.match(lifecycle, /findVeInvitePromotionUrl/);
  assert.match(lifecycle, /SHARE_TOKEN_MISSING/);
  assert.match(lifecycle, /POST_AUTHOR_MISMATCH/);
});

test('canonical shared URL requires an exact referral path and one promotion token', () => {
  assert.match(adapter, /REFERRAL_KEY_PATTERN/);
  assert.match(adapter, /PROMOTION_TOKEN_PATTERN/);
  assert.match(adapter, /PROMOTION_QUERY_PARAM = 'xp'/);
  assert.match(adapter, /REFERRAL_KEY_PATTERN\.test\(match\[1\]\)/);
  assert.match(adapter, /promotionTokens\.length !== 1/);
  assert.doesNotMatch(adapter, /url\.toString\(\)\.toLowerCase\(\)\.includes\(token\)/);
});

test('post not found, pending verification and invalidation preserve durable audit trails', () => {
  assert.match(retryMigration, /u\.submitted_at <= now\(\)-interval '10 minutes'/);
  assert.match(lifecycle, /lookup\.status === 'NOT_FOUND'[\s\S]*invalidatePendingSubmission/);
  assert.match(invalidationMigration, /submission_state='INVALID'/);
  assert.doesNotMatch(invalidationMigration, /update public\.reward_x_promotion_obligations/i);
  assert.doesNotMatch(invalidationMigration, /insert into public\.reward_payouts/i);
});
