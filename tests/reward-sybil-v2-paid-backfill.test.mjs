import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260923064000_add_sybil_v2_paid_backfill_candidates.sql';
const analyzerRefreshMigrationPath =
  'supabase/migrations/20260929210000_require_current_sybil_v2_analyzer.sql';

test('paid backfill candidate view is observation-only and PAID-scoped', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /i\.status = 'COMPLETED'/u);
  assert.match(sql, /i\.reward_status = 'PAID'/u);
  assert.match(sql, /sybil_v2_scan_checkpoints/u);
  assert.match(sql, /analyzer_version <> 'sybil-v2\.0'/u);
  assert.match(sql, /revoke all on public\.operator_sybil_v2_paid_backfill_candidates/u);
  assert.match(sql, /grant select on public\.operator_sybil_v2_paid_backfill_candidates\s+to service_role/u);

  assert.doesNotMatch(sql, /update public\.invitations/u);
  assert.doesNotMatch(sql, /update public\.reward_queue_entries/u);
  assert.doesNotMatch(sql, /delete from/u);
  assert.doesNotMatch(sql, /insert into public\.sybil_v2_wallet_restrictions/u);
});

test('paid backfill publisher reuses the idempotent evidence queue without assessment', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/evidenceQueue.ts',
    'utf8',
  );

  assert.match(
    source,
    /operator_sybil_v2_paid_backfill_candidates/u,
  );
  assert.match(
    source,
    /enqueueSybilV2EvidenceCollection/u,
  );
  assert.match(
    source,
    /observationOnly: true/u,
  );
  assert.match(
    source,
    /historicalRewardsUnaffected: true/u,
  );
  assert.match(
    source,
    /DEFAULT_PAID_BACKFILL_BATCH_SIZE = 4/u,
  );

  assert.doesNotMatch(
    source,
    /record_sybil_v2_assessment/u,
  );
  assert.doesNotMatch(
    source,
    /issue_sybil_v2_reward_clearance/u,
  );
});

test('cron isolates paid backfill from live Sybil/reward stages', async () => {
  const source = await readFile(
    'src/app/api/cron/reconcile/route.ts',
    'utf8',
  );

  assert.match(source, /SYBIL_V2_PAID_BACKFILL/u);
  assert.match(
    source,
    /enqueueSybilV2PaidBackfillBatch\(4\)/u,
  );
  assert.match(
    source,
    /failedStages\.push\('SYBIL_V2_PAID_BACKFILL'\)/u,
  );
  assert.match(source, /sybilV2PaidBackfill/u);
});

test('paid evidence collection itself has no PAID rejection or payout mutation', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/pipeline.ts',
    'utf8',
  );

  const start = source.indexOf(
    'export async function collectSybilV2EvidenceForInvite',
  );
  const end = source.indexOf(
    '\nasync function loadHistoricalRewardSignals',
    start,
  );

  assert.ok(start >= 0 && end > start);
  const collector = source.slice(start, end);

  assert.doesNotMatch(collector, /reward_status === 'PAID'/u);
  assert.doesNotMatch(collector, /reward_status !== 'PAID'/u);
  assert.doesNotMatch(collector, /recordAssessment/u);
  assert.doesNotMatch(collector, /issueClearance/u);
  assert.doesNotMatch(collector, /reward_queue_entries/u);
  assert.doesNotMatch(collector, /reward_payouts/u);
});


test('analyzer upgrades requeue both live and paid COMPLETE checkpoints', async () => {
  const sql = await readFile(analyzerRefreshMigrationPath, 'utf8');
  const versionSource = await readFile(
    'src/lib/sybil/v2/version.ts',
    'utf8',
  );

  assert.match(
    versionSource,
    /SYBIL_V2_ANALYZER_VERSION = 'sybil-v2\.1'/u,
  );
  assert.match(
    sql,
    /create or replace view public\.operator_sybil_v2_scan_candidates/u,
  );
  assert.match(
    sql,
    /create or replace view public\.operator_sybil_v2_paid_backfill_candidates/u,
  );

  const analyzerChecks =
    sql.match(/s\.analyzer_version <> 'sybil-v2\.1'/gu) ?? [];
  assert.equal(analyzerChecks.length, 2);
});

test('stale COMPLETE checkpoints cannot satisfy CLEAR decision checks', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/pipeline.ts',
    'utf8',
  );

  const start = source.indexOf(
    'export async function assessSybilV2Referral',
  );
  const end = source.indexOf(
    '\nexport async function ensureSybilV2ReadyForReward',
    start,
  );

  assert.ok(start >= 0 && end > start);
  const assessor = source.slice(start, end);

  assert.match(
    assessor,
    /checkpointCurrent\s*=\s*checkpoint\?\.analyzer_version === SYBIL_V2_ANALYZER_VERSION/u,
  );
  assert.match(
    assessor,
    /checkpointCurrent[\s\S]*historical_chain_status === 'COMPLETE'[\s\S]*completedChecks\.push\('HISTORICAL_CHAIN'\)/u,
  );
  assert.match(
    assessor,
    /checkpointCurrent[\s\S]*funding_chain_status === 'COMPLETE'[\s\S]*completedChecks\.push\('FUNDING_CHAIN'\)/u,
  );
  assert.match(
    assessor,
    /currentAnalyzerVersion: SYBIL_V2_ANALYZER_VERSION/u,
  );
});


test('five-minute vote recovery drains stale live and paid analyzer backlogs', async () => {
  const [source, rewardRecovery, rewardMaintenance] =
    await Promise.all([
      readFile(
        'src/app/api/cron/vote-reconcile/route.ts',
        'utf8',
      ),
      readFile(
        'src/lib/rewards/rewardReservationRecovery.ts',
        'utf8',
      ),
      readFile(
        'src/lib/rewards/rewardRecoveryMaintenance.ts',
        'utf8',
      ),
    ]);

  const liveQueue = source.indexOf(
    'await enqueueSybilV2EvidenceBacklogBatch',
  );
  const paidQueue = source.indexOf(
    'await enqueueSybilV2PaidBackfillBatch',
  );
  const policy = source.indexOf(
    'await runSybilV2PolicyReassessmentBatch',
    paidQueue,
  );
  const assessment = source.indexOf(
    'await runSybilV2AssessmentBatch',
    policy,
  );
  const reservationRecovery = source.indexOf(
    'await runRewardRecoveryMaintenance',
    assessment,
  );

  assert.ok(liveQueue >= 0);
  assert.ok(paidQueue > liveQueue);
  assert.ok(policy > paidQueue);
  assert.ok(assessment > policy);
  assert.ok(reservationRecovery > assessment);
  assert.match(
    rewardMaintenance,
    /await runRewardReservationRecovery\(\)/u,
  );
  assert.match(
    rewardRecovery,
    /await reserveEligibleReferralRewards\(\)/u,
  );
  assert.match(
    source,
    /enqueueSybilV2EvidenceBacklogBatch\(\s*50,?\s*\)/u,
  );
  assert.match(
    source,
    /enqueueSybilV2PaidBackfillBatch\(\s*10,?\s*\)/u,
  );
  assert.match(
    source,
    /sybilRewardRecoveryMinutes:\s*RECOVERY_INTERVAL_SECONDS \/ 60/u,
  );
});
