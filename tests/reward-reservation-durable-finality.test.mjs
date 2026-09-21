import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  syncInvitation,
  queueHelper,
  queueConsumer,
  vercelConfigRaw,
] = await Promise.all([
  read('src/lib/impact/syncInvitation.ts'),
  read('src/lib/rewards/rewardReservationContinuationQueue.ts'),
  read('src/app/api/queues/reward-reservation/route.ts'),
  read('vercel.json'),
]);

const vercelConfig = JSON.parse(vercelConfigRaw);

test('newly eligible completions publish one durable reservation-finality continuation', () => {
  assert.match(
    syncInvitation,
    /initial\.reward_status !== 'ELIGIBLE'[\s\S]*row\.status === 'COMPLETED'[\s\S]*row\.reward_status === 'ELIGIBLE'/,
  );
  assert.match(
    syncInvitation,
    /enqueueRewardReservationContinuation\(\{/,
  );
  assert.match(queueHelper, /from '@vercel\/queue'/);
  assert.match(
    queueHelper,
    /idempotencyKey:[\s\S]*veinvite-reservation-/,
  );
  assert.match(
    queueHelper,
    /retentionSeconds:[\s\S]*MESSAGE_RETENTION_SECONDS/,
  );
});

test('reservation continuation retries finality without requesting Claim or transferring rewards', () => {
  assert.match(
    queueConsumer,
    /reserveEligibleReferralRewards\(\)/,
  );
  assert.match(queueConsumer, /hasDurableReservation/);
  assert.match(
    queueConsumer,
    /throw new Error\([\s\S]*Reward reservation continuation remains pending/,
  );
  assert.match(
    queueConsumer,
    /visibilityTimeoutSeconds:\s*180/,
  );
  assert.doesNotMatch(
    queueConsumer,
    /runImmediateClaimRewardPayout|request_reward_claim|sendTransaction|privateKey/i,
  );
});

test('reservation Queue has its own Vercel push consumer', () => {
  const routeConfig =
    vercelConfig.functions?.[
      'src/app/api/queues/reward-reservation/route.ts'
    ];
  const trigger = routeConfig?.experimentalTriggers?.[0];

  assert.equal(trigger?.type, 'queue/v2beta');
  assert.equal(
    trigger?.topic,
    'veinvite-reward-reservation-finality',
  );
  assert.equal(trigger?.retryAfterSeconds, 60);
  assert.equal(trigger?.initialDelaySeconds, 0);
});
