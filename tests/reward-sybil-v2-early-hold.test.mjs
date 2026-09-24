import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260923065000_add_sybil_v2_early_assessment_candidates.sql';

test('early candidate view excludes PAID and Claim-ready referrals', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /i\.reward_status in \('NONE','PENDING','ELIGIBLE'\)/u,
  );
  assert.match(sql, /q\.invite_code is null/u);
  assert.match(
    sql,
    /coalesce\(a\.state, ''\) not in \('HOLD','RESTRICTED'\)/u,
  );
});

test('early candidate freshness is cluster-targeted instead of network-global', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /peer\.app_id = own\.app_id/u,
  );
  assert.match(
    sql,
    /peer\.destination_wallet = own\.destination_wallet/u,
  );
  assert.match(
    sql,
    /peer\.related_wallet = own\.related_wallet/u,
  );
  assert.doesNotMatch(sql, /newest_network_evidence/u);
});

test('early candidate view is service-role only', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /with \(security_invoker = true\)/u);
  assert.match(
    sql,
    /revoke all on public\.operator_sybil_v2_early_assessment_candidates[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    sql,
    /grant select on public\.operator_sybil_v2_early_assessment_candidates[\s\S]*to service_role/u,
  );
});

test('EARLY mode never issues a reward clearance', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/pipeline.ts',
    'utf8',
  );

  assert.match(source, /mode\?: SybilV2AssessmentMode/u);
  assert.match(source, /const earlyMode = mode === 'EARLY'/u);
  assert.match(
    source,
    /allowEarlyHold: earlyMode/u,
  );
  assert.match(
    source,
    /if \(\s*!earlyMode &&\s*revision !== null/u,
  );
  assert.match(
    source,
    /assessmentMode: mode/u,
  );
});

test('system HOLD is durable until operator resolution', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/pipeline.ts',
    'utf8',
  );

  assert.match(
    source,
    /currentAssessment &&\s*\['HOLD', 'RESTRICTED'\]\.includes\(currentAssessment\.state\)/u,
  );
  assert.doesNotMatch(
    source,
    /currentAssessment\?\.source === 'OPERATOR' &&\s*\['HOLD', 'RESTRICTED'\]/u,
  );
});

test('evidence Queue runs exact-invite early assessment before peer/final batches', async () => {
  const source = await readFile(
    'src/app/api/queues/sybil-v2-evidence/route.ts',
    'utf8',
  );

  const exactIndex = source.indexOf(
    'await assessSybilV2EarlyReferral',
  );
  const peerIndex = source.indexOf(
    'await runSybilV2EarlyAssessmentBatch(10)',
  );
  const finalIndex = source.indexOf(
    'await runSybilV2AssessmentBatch(10)',
  );

  assert.ok(exactIndex >= 0);
  assert.ok(peerIndex > exactIndex);
  assert.ok(finalIndex > peerIndex);
});

test('reconcile keeps early and final assessment as isolated stages', async () => {
  const source = await readFile(
    'src/app/api/cron/reconcile/route.ts',
    'utf8',
  );

  assert.match(
    source,
    /SYBIL_V2_EARLY_ASSESSMENT/u,
  );
  assert.match(
    source,
    /runSybilV2EarlyAssessmentBatch\(10\)/u,
  );
  assert.match(
    source,
    /sybilV2EarlyAssessment/u,
  );
});


test('clearing an early HOLD never queues a reward before completion', async () => {
  const source = await readFile(
    'src/app/api/admin/sybil/review/route.ts',
    'utf8',
  );

  assert.match(
    source,
    /decision === 'CLEAR'[\s\S]*before\.status === 'COMPLETED'[\s\S]*before\.reward_status === 'ELIGIBLE'[\s\S]*await enqueueClearedReward\(inviteCode\)/u,
  );
});


test('operator-cleared early evidence is suppressed at final unless the cluster changes', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/pipeline.ts',
    'utf8',
  );

  assert.match(
    source,
    /OPERATOR_CLEARED_EARLY_FAMILIES/u,
  );
  assert.match(
    source,
    /operatorClearedEarlyBaseline && !earlyMode/u,
  );
  assert.match(
    source,
    /!OPERATOR_CLEARED_EARLY_FAMILIES\.has\(signal\.family\)/u,
  );
  assert.match(
    source,
    /hasNewEarlyClusterEvidence/u,
  );
});

test('operator early CLEAR survives transient incomplete final checks', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/pipeline.ts',
    'utf8',
  );

  assert.match(
    source,
    /OPERATOR_CLEARED_AWAITING_FINAL_CHECKS/u,
  );
  assert.match(
    source,
    /operatorClearedEarlyBaseline[\s\S]*!requiredChecksComplete[\s\S]*clearanceIssued: false/u,
  );
});
