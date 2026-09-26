import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('paid backfill cron is isolated, authenticated, and capped at 10', async () => {
  const source = await readFile(
    'src/app/api/cron/sybil-v2-paid-backfill/route.ts',
    'utf8',
  );

  assert.match(source, /process\.env\.CRON_SECRET/u);
  assert.match(source, /timingSafeEqual/u);
  assert.match(
    source,
    /enqueueSybilV2PaidBackfillBatch\(10\)/u,
  );
  assert.doesNotMatch(source, /runAutomaticRewardPayout/u);
  assert.doesNotMatch(source, /runReconciliationBatch/u);
  assert.doesNotMatch(source, /record_sybil_v2_assessment/u);
});

test('paid backfill route remains available but is not automatically scheduled after backlog drain', async () => {
  const config = JSON.parse(
    await readFile('vercel.json', 'utf8'),
  );

  const cron = config.crons.find(
    (entry) =>
      entry.path === '/api/cron/sybil-v2-paid-backfill',
  );

  assert.equal(cron, undefined);
});

test('paid backfill publisher remains PAID-scoped and observation-only', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/evidenceQueue.ts',
    'utf8',
  );

  assert.match(
    source,
    /operator_sybil_v2_paid_backfill_candidates/u,
  );
  assert.match(source, /observationOnly: true/u);
  assert.match(source, /historicalRewardsUnaffected: true/u);
  assert.match(source, /MAX_PAID_BACKFILL_BATCH_SIZE = 10/u);
});
