import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  syncInvitation,
  sybilPipeline,
  queueHelper,
  queueConsumer,
  reservation,
  voteCron,
  migration,
] = await Promise.all([
  read('src/lib/impact/syncInvitation.ts'),
  read('src/lib/sybil/v2/pipeline.ts'),
  read('src/lib/rewards/rewardReservationContinuationQueue.ts'),
  read('src/app/api/queues/reward-reservation/route.ts'),
  read('src/lib/rewards/rewardReservation.ts'),
  read('src/app/api/cron/vote-reconcile/route.ts'),
  read('supabase/migrations/20261005154100_add_reward_reservation_liveness_guard_v1.sql'),
]);

test('reward eligibility publishes a durable continuation before Sybil finality is ready', () => {
  const start = syncInvitation.indexOf(
    'if (becameRewardEligible)',
  );
  const end = syncInvitation.indexOf(
    '\n\n  return {\n    row,',
    start,
  );
  const block = syncInvitation.slice(start, end);

  const publish = block.indexOf(
    'enqueueRewardReservationContinuation',
  );
  const assessment = block.indexOf(
    'ensureSybilV2ReadyForReward',
  );

  assert.ok(start >= 0 && end > start);
  assert.ok(publish >= 0);
  assert.ok(assessment > publish);
  assert.match(block, /trigger: 'ELIGIBILITY'/u);
  assert.doesNotMatch(
    block,
    /if \(!sybilV2Enforced \|\| v2Ready\)[\s\S]*enqueueRewardReservationContinuation/u,
  );
});

test('current Sybil clearance is a second revision-scoped reservation wake-up', () => {
  const start = sybilPipeline.indexOf(
    'async function issueClearance',
  );
  const end = sybilPipeline.indexOf(
    'export async function assessSybilV2Referral',
    start,
  );
  const block = sybilPipeline.slice(start, end);

  assert.match(
    block,
    /enqueueRewardReservationContinuation/u,
  );
  assert.match(
    block,
    /trigger: 'SYBIL_CLEARANCE'/u,
  );
  assert.match(
    block,
    /assessmentRevision: issuedRevision/u,
  );
  assert.match(
    queueHelper,
    /clearance-\$\{payload\.assessmentRevision\}/u,
  );
  assert.match(
    queueHelper,
    /veinvite-reservation-\$\{payload\.inviteCode\}-\$\{idempotencySuffix\}/u,
  );
});

test('reservation skip reasons are observable without weakening reward gates', () => {
  assert.match(
    reservation,
    /Reward reservation candidate skipped:/u,
  );
  for (const reason of [
    'RUNTIME_CLOSED',
    'POOL_DISTRIBUTION_PAUSED',
    'PLANNING_UNAVAILABLE',
    'NON_POSITIVE_REWARD',
    'RPC_NOT_RESERVED',
    'REPRICE_EXHAUSTED',
  ]) {
    assert.match(
      reservation,
      new RegExp(reason),
    );
  }

  assert.match(
    queueConsumer,
    /trigger=\$\{message\.trigger \?\? 'LEGACY'\}/u,
  );
  assert.doesNotMatch(
    queueConsumer,
    /sendTransaction|privateKey/u,
  );
});

test('five-minute recovery detects a stale CLEAR referral missing its reservation', () => {
  assert.match(
    reservation,
    /read_stale_reward_reservation_liveness/u,
  );
  assert.match(
    voteCron,
    /readStaleEligibleRewardReservationLiveness/u,
  );
  assert.match(
    voteCron,
    /REWARD_RESERVATION_LIVENESS_FAILED/u,
  );
  assert.match(
    migration,
    /assessment_revision = a\.revision/u,
  );
  assert.match(
    migration,
    /not exists \([\s\S]*reward_queue_entries/u,
  );
  assert.match(
    migration,
    /reward_reservation_legacy_exclusions/u,
  );
  assert.match(
    migration,
    /grant execute[\s\S]*to service_role/u,
  );
});
