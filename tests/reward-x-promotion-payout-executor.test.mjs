import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionPayoutExecutor.ts',
    import.meta.url,
  ),
  'utf8',
);

const cron = await readFile(
  new URL(
    '../src/app/api/cron/x-promotion-maintenance/route.ts',
    import.meta.url,
  ),
  'utf8',
);

test('new X promotion signing requires independent worker and DB LIVE gates', () => {
  assert.match(
    source,
    /VEINVITE_X_PROMOTION_PAYOUT_WORKER_ENABLED/,
  );
  assert.match(
    source,
    /VEINVITE_AUTOMATIC_REWARDS_ENABLED/,
  );
  assert.match(
    source,
    /reward_x_promotion_enabled,reward_x_promotion_live_started_at/,
  );
  assert.match(
    source,
    /X promotion LIVE is disabled/,
  );
});

test('promotion payout shares the core global signer lock', () => {
  assert.match(
    source,
    /automatic_reward_payout:\$\{network\}/,
  );
  assert.doesNotMatch(
    source,
    /x_promotion_payout:\$\{network\}/,
  );
});

test('core referral payouts retain priority over new promotion signing', () => {
  assert.match(
    source,
    /reward_queue_entries/,
  );
  assert.match(
    source,
    /reward_rounds/,
  );
  assert.match(
    source,
    /Core referral reward payout has priority/,
  );
  assert.match(
    source,
    /Core referral reward appeared before X promotion signing/,
  );
});

test('signing rechecks pool safety and total outstanding liability', () => {
  assert.match(
    source,
    /readVeInviteRewardPoolStatus/,
  );
  assert.match(
    source,
    /read_outstanding_reward_liability/,
  );
  assert.match(
    source,
    /poolBalance <\s*outstandingLiability/,
  );
  assert.match(
    source,
    /distributionPaused/,
  );
  assert.match(
    source,
    /rewardDistributors/,
  );
});

test('signed transaction is atomically journaled before any broadcast', () => {
  const journal =
    source.indexOf(
      'register_reward_x_promotion_signed_submission_v1',
    );
  const broadcast =
    source.indexOf(
      'broadcastExactSignedTransaction',
      journal,
    );

  assert.ok(journal >= 0);
  assert.ok(broadcast > journal);
});

test('committed signed transaction recovery does not depend on new signing gates', () => {
  const recovery =
    source.indexOf(
      'if (\n      state.signedTransaction &&\n      state.submission',
    );
  const runtimeGate =
    source.indexOf(
      'const runtime =\n    await readRuntimeGate',
    );

  assert.ok(recovery >= 0);
  assert.ok(runtimeGate > recovery);
  assert.match(
    source,
    /raw_tx_hex/,
  );
  assert.match(
    source,
    /verifyFinalizedXPromotionTransactionOnChain/,
  );
  assert.match(
    source,
    /finalize_reward_x_promotion_payout_v1/,
  );
});

test('executor reuses the exact signed transaction instead of resigning on retry', () => {
  assert.match(
    source,
    /Transaction\.decode/,
  );
  assert.match(
    source,
    /getTransaction\(txId\)/,
  );
  assert.match(
    source,
    /sendTransaction/,
  );
  assert.match(
    source,
    /VeChain returned a different transaction id/,
  );
});

test('promotion executor is not yet wired into lifecycle cron', () => {
  assert.doesNotMatch(
    cron,
    /rewardXPromotionPayoutExecutor/,
  );
  assert.doesNotMatch(
    cron,
    /runRewardXPromotionPayout/,
  );
});
