import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260923064000_add_sybil_v2_paid_backfill_candidates.sql';

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
