import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pipeline = await readFile(
  'src/lib/sybil/v2/pipeline.ts',
  'utf8',
);
const primitives = await readFile(
  'src/lib/sybil/v2/pipelinePrimitives.ts',
  'utf8',
);
const syncInvitation = await readFile(
  'src/lib/impact/syncInvitation.ts',
  'utf8',
);
const monitoringMigration = await readFile(
  'supabase/migrations/20260930102000_add_sybil_stage_freshness_monitoring.sql',
  'utf8',
);

test('pre-vote referrals cannot complete CHAIN_FINALITY', () => {
  assert.match(
    primitives,
    /if \(!voteCompleted\) \{\s*return false;/u,
  );
  assert.match(
    pipeline,
    /voteCompleted:\s*invitation\.vote_completed === true/u,
  );
  assert.match(
    pipeline,
    /isFinalizedVoteCheckpoint/u,
  );
});

test('operator decisions preserve their verdict while invalid pre-vote finality is repaired', () => {
  assert.match(
    pipeline,
    /repairOperatorPreVoteFinality/u,
  );
  assert.match(
    pipeline,
    /preservedOperatorDecision:\s*true/u,
  );
  assert.match(
    pipeline,
    /check !== 'CHAIN_FINALITY'/u,
  );
  assert.match(
    pipeline,
    /p_source:\s*'OPERATOR'/u,
  );
  assert.match(
    pipeline,
    /p_expected_revision:\s*revision/u,
  );
});

test('operator CLEAR with invalid pre-vote finality is not skipped by recovery candidate selection', () => {
  assert.match(
    pipeline,
    /const operatorInvalidPreVoteFinality =/u,
  );
  assert.match(
    pipeline,
    /!operatorClearWithNewEvidence &&\s*!operatorInvalidPreVoteFinality/u,
  );
});

test('third dApp completion triggers immediate lightweight Sybil reassessment', () => {
  assert.match(
    syncInvitation,
    /const thirdAppJustCompleted =/u,
  );
  assert.match(
    syncInvitation,
    /initialAppsCompleted < 3/u,
  );
  assert.match(
    syncInvitation,
    /appsCompleted >= 3/u,
  );
  assert.match(
    syncInvitation,
    /await assessSybilV2Referral\(/u,
  );
});

test('five-minute recovery revisits stale mission identity and invalid finality states', () => {
  assert.match(
    pipeline,
    /missionProgressStale/u,
  );
  assert.match(
    pipeline,
    /identityAssessmentStale/u,
  );
  assert.match(
    pipeline,
    /vePassportRetryDue/u,
  );
  assert.match(
    pipeline,
    /invalidPreVoteFinality/u,
  );
});

test('operator monitoring records stage freshness watchdogs', () => {
  for (const code of [
    'SYBIL_V2_ACTIVATION_ASSESSMENT_STALE',
    'SYBIL_V2_THIRD_APP_REASSESSMENT_STALE',
    'SYBIL_V2_IDENTITY_REASSESSMENT_STALE',
    'SYBIL_V2_VOTE_REASSESSMENT_STALE',
    'SYBIL_V2_INVALID_PREVOTE_FINALITY',
  ]) {
    assert.match(
      monitoringMigration,
      new RegExp(code, 'u'),
    );
  }

  assert.match(
    monitoringMigration,
    /interval '5 minutes'/u,
  );
});
