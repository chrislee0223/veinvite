import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  migration,
  sybilPipeline,
  evidenceConsumer,
  reservation,
  reservationConsumer,
] = await Promise.all([
  read('supabase/migrations/20261012194500_dedupe_sybil_v2_clearance_revision.sql'),
  read('src/lib/sybil/v2/pipeline.ts'),
  read('src/app/api/queues/sybil-v2-evidence/route.ts'),
  read('src/lib/rewards/rewardReservation.ts'),
  read('src/app/api/queues/reward-reservation/route.ts'),
]);

test('SYSTEM assessments with unchanged substantive evidence preserve the current revision', () => {
  assert.match(migration, /v_source = 'SYSTEM'/);
  assert.match(migration, /v_existing\.source = 'SYSTEM'/);
  for (const invariant of [
    'v_existing.network = v_network',
    'v_existing.state = v_state',
    'v_existing.risk_score = p_risk_score',
    'v_existing.policy_version = btrim(p_policy_version)',
    'v_existing.analyzer_version = btrim(p_analyzer_version)',
    'v_existing.evidence_cutoff_block is not distinct from p_evidence_cutoff_block',
    'v_existing.required_checks',
    'v_existing.completed_checks',
    'v_existing.reason_codes',
  ]) assert.ok(migration.includes(invariant), invariant);
  assert.match(migration, /#- '\{vePassport,checkedAt\}'::text\[\]/);
  assert.match(migration, /'unchanged', true/);
  assert.match(migration, /'revision', v_existing\.revision/);
  assert.match(migration, /if p_expected_revision is not null/);
  assert.match(migration, /insert into public\.sybil_v2_assessment_events/);
});

test('reused CLEAR proof does not spawn fresh reward continuation', () => {
  assert.match(migration, /'reused', true/);
  assert.match(sybilPipeline, /result\.issued === true &&\s+result\.reused !== true/);
  assert.match(sybilPipeline, /trigger: 'SYBIL_CLEARANCE'/);
});

test('replayed complete evidence does not repeatedly fan out peer re-assessment', () => {
  assert.match(sybilPipeline, /reusedCheckpoint: true/);
  assert.match(sybilPipeline, /reusedCheckpoint: false/);
  assert.match(evidenceConsumer, /if \(!result\.reusedCheckpoint\) \{\s+await runSybilV2AssessmentBatch\(3\)/);
  assert.match(evidenceConsumer, /await assessSybilV2Referral\(message\.inviteCode\)/);
});

test('pricing exhaustion logs the database refusal while retaining immutable reservation gates', () => {
  assert.match(reservation, /repriceResponses\.push\(result\)/);
  assert.match(reservation, /lastRpcResponse: repriceResponses\.at\(-1\)/);
  assert.match(reservation, /'REPRICE_EXHAUSTED'/);
  assert.match(reservation, /commit_reward_reservation_with_late_reserve/);
  assert.match(reservation, /await rewardReservationRuntimeOpen\(network\)/);
});

test('continuation Queue retries are bounded and leave durable liveness monitoring intact', () => {
  assert.match(reservationConsumer, /metadata\.deliveryCount >= 10/);
  assert.match(reservationConsumer, /latestRevision > message\.assessmentRevision/);
  assert.match(reservationConsumer, /visibilityTimeoutSeconds: 300/);
  assert.match(evidenceConsumer, /visibilityTimeoutSeconds: 300/);
  assert.match(reservationConsumer, /acknowledge: true/);
  assert.match(reservationConsumer, /afterSeconds: Math\.min\(\s+900/);
  assert.match(reservation, /read_stale_reward_reservation_liveness/);
});
