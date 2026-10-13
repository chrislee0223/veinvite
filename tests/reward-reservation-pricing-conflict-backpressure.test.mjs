import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [reservation, consumer, recovery, voteCron] = await Promise.all([
  read('src/lib/rewards/rewardReservation.ts'),
  read('src/app/api/queues/reward-reservation/route.ts'),
  read('src/lib/rewards/rewardReservationRecovery.ts'),
  read('src/app/api/cron/vote-reconcile/route.ts'),
]);

test('immutable reservation pricing still uses the authoritative DB RPC and refuses incorrect quotes', () => {
  assert.match(reservation, /commit_reward_reservation_with_late_reserve/);
  assert.match(reservation, /if \(result\.reason === 'RECALCULATE'\)/);
  assert.match(reservation, /repriceResponses\.push\(result\)/);
  assert.match(reservation, /const MAX_REPRICE_ATTEMPTS = 4/);
  assert.match(reservation, /lastRpcResponse: repriceResponses\.at\(-1\) \?\? null/);
  assert.match(reservation, /expectedCohortCommittedWei: lastExpectedCohortCommittedWei/);
  assert.match(reservation, /expectedOutstandingWei: lastExpectedOutstandingWei/);
  assert.match(reservation, /await rewardReservationRuntimeOpen\(network\)/);
});

test('the sweep isolates the exact invite code that exhausted authoritative repricing', () => {
  assert.match(reservation, /pricingConflictInviteCodes: string\[\]/);
  assert.match(reservation, /reason === 'REPRICE_EXHAUSTED'/);
  assert.match(reservation, /\? 'pricing_conflict'/);
  assert.match(reservation, /pricingConflictInviteCodes\.push\(candidate\.invite_code\)/);
  assert.match(reservation, /result\.skipped \+= 1/);
});

test('Queue acknowledges only this exact pricing-refused invite after checking current security and eligibility', () => {
  const checkAfter = consumer.indexOf('const refreshedInvitation =');
  const pricingAck = consumer.indexOf('sweep.pricingConflictInviteCodes.includes(message.inviteCode)');
  const pendingError = consumer.indexOf('Reward reservation continuation remains pending');
  assert.ok(checkAfter >= 0 && pricingAck > checkAfter && pendingError > pricingAck);
  assert.match(consumer, /if \(hasDurableReservation\(after\)\) \{/);
  assert.match(consumer, /refreshedInvitation\.reward_status !== 'ELIGIBLE'/);
  assert.match(consumer, /latestRevision !== message\.assessmentRevision/);
  assert.match(consumer, /return;\s+}\s+throw new Error\(/);
  assert.doesNotMatch(consumer, /sendTransaction|privateKey|\.update\('reward_queue_entries'\)/);
});

test('durable five-minute recovery remains responsible for re-checking the unresolved reservation', () => {
  assert.match(recovery, /reserveEligibleReferralRewards\(\)/);
  assert.match(recovery, /readStaleEligibleRewardReservationLiveness\(/);
  assert.match(recovery, /REWARD_RESERVATION_LIVENESS_FAILED/);
  assert.match(voteCron, /RECOVERY_INTERVAL_SECONDS = 5 \* 60/);
  assert.match(voteCron, /runRewardRecoveryMaintenance\(\)/);
});
