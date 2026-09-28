import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Sybil verdict does not wait for chain finality while reward clearance still does', async () => {
  const pipeline = await readFile(
    'src/lib/sybil/v2/pipeline.ts',
    'utf8',
  );
  const clearanceMigration = await readFile(
    'supabase/migrations/20260924150000_align_sybil_v2_authority.sql',
    'utf8',
  );

  assert.match(
    pipeline,
    /const DECISION_CHECKS = \[[\s\S]*'HISTORICAL_CHAIN'[\s\S]*'FUNDING_CHAIN'[\s\S]*'MISSION_BEHAVIOR'[\s\S]*'SECURITY_IDENTITY'[\s\S]*\] as const;/u,
  );
  assert.doesNotMatch(
    pipeline.match(/const DECISION_CHECKS = \[[\s\S]*?\] as const;/u)?.[0] ?? '',
    /CHAIN_FINALITY/u,
  );
  assert.match(
    pipeline,
    /const REQUIRED_CHECKS = \[[\s\S]*\.\.\.DECISION_CHECKS,[\s\S]*'CHAIN_FINALITY'[\s\S]*\] as const;/u,
  );
  assert.match(
    pipeline,
    /const decisionChecksComplete = DECISION_CHECKS\.every/u,
  );
  assert.match(
    pipeline,
    /requiredChecksComplete: decisionChecksComplete/u,
  );
  assert.doesNotMatch(
    pipeline,
    /analysisFailed:\s*analysisFailed\s*\|\|[\s\S]*finalizedBlock === null/u,
  );

  assert.match(
    clearanceMigration,
    /v_assessment\.required_checks <@ v_assessment\.completed_checks/u,
  );
  assert.match(
    clearanceMigration,
    /v_assessment\.evidence_cutoff_block < v_invitation\.vote_completed_block/u,
  );
});

test('vote-triggered assessment batches can honor the requested 25-referral burst', async () => {
  const pipeline = await readFile(
    'src/lib/sybil/v2/pipeline.ts',
    'utf8',
  );

  assert.match(pipeline, /MAX_ASSESSMENT_BATCH_SIZE = 25/u);
  const start = pipeline.indexOf('export async function runSybilV2AssessmentBatch');
  assert.ok(start >= 0);
  const body = pipeline.slice(start);
  assert.match(body, /Math\.min\(MAX_ASSESSMENT_BATCH_SIZE, Math\.trunc\(limit\)\)/u);
});
