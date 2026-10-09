import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const worker = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionMaintenance.ts',
    import.meta.url,
  ),
  'utf8',
);
const scheduler = await readFile(
  new URL(
    '../src/lib/rewards/rewardBoostReserveScheduler.ts',
    import.meta.url,
  ),
  'utf8',
);
const reservation = await readFile(
  new URL('../src/lib/rewards/rewardReservation.ts', import.meta.url),
  'utf8',
);
const claim = await readFile(
  new URL('../src/app/api/rewards/claims/route.ts', import.meta.url),
  'utf8',
);
const payout = await readFile(
  new URL('../src/lib/rewards/automaticRewardPayout.ts', import.meta.url),
  'utf8',
);

test('maintenance is a no-op before X promotion LIVE activation', () => {
  const runStart = worker.indexOf(
    'export async function runRewardXPromotionMaintenance',
  );
  assert.ok(runStart >= 0);

  const runBody = worker.slice(runStart);
  const gateIndex = runBody.indexOf(
    'if (!(await liveEnabled()))',
  );
  const securityIndex = runBody.indexOf(
    "'release_terminal_reward_x_promotion_security_v1'",
  );
  const pendingReadIndex = runBody.indexOf(
    "'read_reward_x_promotion_pending_post_candidates_v1'",
  );
  const finalReadIndex = runBody.indexOf(
    "'read_reward_x_promotion_final_post_candidates_v1'",
  );

  assert.ok(gateIndex >= 0);
  assert.ok(securityIndex > gateIndex);
  assert.ok(pendingReadIndex > gateIndex);
  assert.ok(finalReadIndex > gateIndex);
  assert.match(
    runBody.slice(gateIndex, securityIndex),
    /enabled: false/,
  );
});

test('maintenance handles security, opportunity lifecycle and both verification phases', () => {
  assert.match(
    worker,
    /release_terminal_reward_x_promotion_security_v1/,
  );
  assert.match(
    worker,
    /sync_reward_x_promotion_opportunities_v1/,
  );
  assert.match(
    worker,
    /expire_reward_x_promotion_opportunities_v1/,
  );
  assert.match(
    worker,
    /read_reward_x_promotion_pending_post_candidates_v1/,
  );
  assert.match(
    worker,
    /record_reward_x_promotion_initial_post_verification_v1/,
  );
  assert.match(
    worker,
    /read_reward_x_promotion_final_post_candidates_v1/,
  );
  assert.match(
    worker,
    /finalize_reward_x_promotion_post_verification_v1/,
  );
});

test('transient X failures are retried instead of invalidating the reward', () => {
  assert.match(worker, /lookup\.status === 'RETRY'/);
  assert.match(worker, /outcome: 'RETRY'/);
  assert.match(
    worker,
    /record_reward_x_promotion_verification_attempt_v1/,
  );
});

test('terminal Post failures use the narrow invalidation paths', () => {
  assert.match(worker, /POST_NOT_FOUND/);
  assert.match(worker, /POST_NOT_ORIGINAL/);
  assert.match(worker, /SHARE_TOKEN_MISSING/);
  assert.match(worker, /POST_AUTHOR_MISMATCH/);
  assert.match(
    worker,
    /invalidate_reward_x_promotion_post_submission_v1/,
  );
  assert.match(
    worker,
    /invalidate_reward_x_promotion_post_verification_v1/,
  );
});

test('non-terminal Sybil uncertainty goes to review rather than release', () => {
  assert.match(
    worker,
    /REWARD_X_PROMOTION_POST_SECURITY_NOT_CLEAR/,
  );
  assert.match(
    worker,
    /mark_reward_x_promotion_post_review_required_v1/,
  );
  assert.match(worker, /SECURITY_NOT_CLEAR/);
});

test('scheduler keeps X promotion verification fail-soft', () => {
  assert.match(scheduler, /runRewardXPromotionMaintenance/);
  assert.match(
    scheduler,
    /X promotion verification maintenance failed/,
  );

  const blockStart = scheduler.indexOf(
    'await runRewardXPromotionMaintenance();',
  );
  const blockEnd = scheduler.indexOf(
    '\n\n  return {',
    blockStart,
  );
  const block = scheduler.slice(blockStart, blockEnd);

  assert.doesNotMatch(block, /errors\.push/);
  assert.match(block, /console\.warn/);
});

test('core reservation, Claim and referral payout remain isolated', () => {
  for (const source of [reservation, claim, payout]) {
    assert.doesNotMatch(
      source,
      /rewardXPromotionMaintenance|runRewardXPromotionMaintenance/,
    );
  }
});
