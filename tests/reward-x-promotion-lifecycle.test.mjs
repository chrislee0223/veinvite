import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const lifecycle = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionLifecycle.ts',
    import.meta.url,
  ),
  'utf8',
);

const route = await readFile(
  new URL(
    '../src/app/api/cron/x-promotion-maintenance/route.ts',
    import.meta.url,
  ),
  'utf8',
);

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009142000_add_x_promotion_lifecycle_maintenance_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

const vercel = await readFile(
  new URL('../vercel.json', import.meta.url),
  'utf8',
);

test('X promotion lifecycle is isolated from core payout execution', () => {
  assert.doesNotMatch(
    lifecycle,
    /automaticRewardPayout|mnemonic|private.?key|reward_payouts/i,
  );
  assert.match(
    lifecycle,
    /sync_reward_x_promotion_opportunities_v1/,
  );
  assert.match(
    lifecycle,
    /expire_reward_x_promotion_opportunities_v1/,
  );
});

test('X API retry remains non-terminal and final uncertainty becomes review required', () => {
  assert.match(
    lifecycle,
    /lookup\.status === 'RETRY'/,
  );
  assert.match(
    lifecycle,
    /markReward|markReviewRequired/,
  );
  assert.match(
    lifecycle,
    /SECURITY_NOT_CLEAR/,
  );
  assert.match(
    lifecycle,
    /REVIEW_REQUIRED/,
  );
});

test('final verification checks the same author and promotion URL again', () => {
  assert.match(
    lifecycle,
    /lookup\.authorId !==[\s\S]*candidate\.xAuthorId/,
  );
  assert.match(
    lifecycle,
    /findVeInvitePromotionUrl\([\s\S]*candidate\.shareToken/,
  );
  assert.match(
    lifecycle,
    /finalize_reward_x_promotion_post_verification_v2/,
  );
});

test('terminal Sybil handling releases both RESERVED and HELD obligations', () => {
  assert.match(
    migration,
    /financial_state in \('RESERVED','HELD'\)/,
  );
  assert.match(
    migration,
    /release_reason='SYBIL_TERMINAL'/,
  );
});

test('opportunity expiry never releases an active pending or verified submission', () => {
  assert.match(
    migration,
    /submission_state in \('PENDING','VERIFIED'\)/,
  );
  assert.match(
    migration,
    /NO_VALID_POST_BEFORE_DEADLINE/,
  );
  assert.match(
    migration,
    /submission_grace_seconds/,
  );
});

test('verification retries have bounded backoff and fair ordering', () => {
  assert.match(
    migration,
    /interval '15 minutes'/,
  );
  assert.match(
    migration,
    /interval '60 minutes'/,
  );
  assert.match(
    migration,
    /coalesce\(retry\.latest_attempt_at,u\.submitted_at\)/,
  );
  assert.match(
    migration,
    /coalesce\(retry\.latest_attempt_at,p\.verify_after\)/,
  );
});

test('lifecycle cron is independent and runs every fifteen minutes', () => {
  assert.match(
    route,
    /x-promotion-lifecycle/,
  );
  assert.match(
    route,
    /tryClaimCronJob/,
  );

  const config = JSON.parse(vercel);
  const cron = config.crons.find(
    (item) =>
      item.path ===
      '/api/cron/x-promotion-maintenance',
  );

  assert.ok(cron);
  assert.equal(
    cron.schedule,
    '*/15 * * * *',
  );
});
