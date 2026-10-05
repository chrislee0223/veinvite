import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  syncInvitation,
  eligibilityContinuation,
  sybilPipeline,
  queueHelper,
  queueConsumer,
  reservation,
  rewardRecovery,
  voteCron,
  migration,
] = await Promise.all([
  read('src/lib/impact/syncInvitation.ts'),
  read('src/lib/rewards/rewardEligibilityContinuation.ts'),
  read('src/lib/sybil/v2/pipeline.ts'),
  read('src/lib/rewards/rewardReservationContinuationQueue.ts'),
  read('src/app/api/queues/reward-reservation/route.ts'),
  read('src/lib/rewards/rewardReservation.ts'),
  read('src/lib/rewards/rewardReservationRecovery.ts'),
  read('src/app/api/cron/vote-reconcile/route.ts'),
  read('supabase/migrations/20261005162635_add_reward_reservation_liveness_guard_v1.sql'),
]);

test('reward eligibility publishes a durable continuation before Sybil finality is ready', () => {
  assert.match(
    syncInvitation,
    /continueRewardReservationAfterEligibility\([\s\S]*row\.invite_code/u,
  );

  const publish = eligibilityContinuation.indexOf(
    'enqueueRewardReservationContinuation',
  );
  const assessment = eligibilityContinuation.indexOf(
    'ensureSybilV2ReadyForReward',
  );

  assert.ok(publish >= 0);
  assert.ok(assessment > publish);
  assert.match(
    eligibilityContinuation,
    /trigger: 'ELIGIBILITY'/u,
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

test('liveness monitoring is silent during an intentional emergency reward pause', () => {
  const start = reservation.indexOf(
    'export async function readStaleEligibleRewardReservationLiveness',
  );
  const end = reservation.indexOf(
    'async function reserveCandidate',
    start,
  );
  const block = reservation.slice(start, end);

  assert.match(
    block,
    /await readRewardRuntimeSafety\(\)/u,
  );
  assert.match(
    block,
    /if \(runtime\.emergencyRewardsPaused\)/u,
  );
  assert.match(
    block,
    /missingCount: 0/u,
  );
  assert.ok(
    block.indexOf('runtime.emergencyRewardsPaused') <
      block.indexOf('read_stale_reward_reservation_liveness'),
    'emergency pause must suppress the stale-reservation RPC before it can alert',
  );
});

test('five-minute recovery detects a stale CLEAR referral missing its reservation', () => {
  assert.match(
    reservation,
    /read_stale_reward_reservation_liveness/u,
  );
  assert.match(
    voteCron,
    /runRewardReservationRecovery/u,
  );
  assert.match(
    rewardRecovery,
    /readStaleEligibleRewardReservationLiveness/u,
  );
  assert.match(
    rewardRecovery,
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
