import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scheduler = await readFile(
  new URL('../src/lib/rewards/rewardBoostReserveScheduler.ts', import.meta.url),
  'utf8',
);
const cron = await readFile(
  new URL('../src/app/api/cron/vote-reconcile/route.ts', import.meta.url),
  'utf8',
);
const vercel = JSON.parse(
  await readFile(
    new URL('../vercel.json', import.meta.url),
    'utf8',
  ),
);

test('submitted payout settlement fallback runs from the existing minute cron', () => {
  assert.match(
    scheduler,
    /SUBMITTED_PAYOUT_RECOVERY_INTERVAL_SECONDS\s*=\s*60/,
  );
  assert.match(
    scheduler,
    /vote-reconcile:submitted-payout-recovery/,
  );
  assert.match(
    scheduler,
    /recoverSubmittedRewardPayout\(\)/,
  );
  assert.match(
    cron,
    /runScheduledRewardMaintenance\(\)/,
  );
});

test('settlement fallback only reconciles an already-submitted immutable payout', () => {
  assert.doesNotMatch(
    scheduler,
    /runAutomaticRewardPayout\(/,
  );
  assert.doesNotMatch(
    scheduler,
    /runImmediateClaimRewardPayout\(/,
  );
  assert.match(
    scheduler,
    /recoverSubmittedRewardPayout/,
  );
});

test('waiting finality is a healthy retry state while deterministic intervention is loud', () => {
  assert.match(
    scheduler,
    /recovery\.status ===[\s\S]*'MANUAL_INTERVENTION_REQUIRED'/,
  );
  assert.match(
    scheduler,
    /SUBMITTED_PAYOUT_RECOVERY_MANUAL_INTERVENTION/,
  );
  assert.match(
    scheduler,
    /markCronJobSucceeded\([\s\S]*SUBMITTED_PAYOUT_RECOVERY_JOB/,
  );
});

test('submitted payout recovery runs before reserve maintenance', () => {
  const submittedIndex = scheduler.indexOf(
    'await runScheduledSubmittedPayoutRecovery()',
  );
  const reserveIndex = scheduler.indexOf(
    'await runScheduledRewardBoostReserveRebalance()',
  );

  assert.ok(submittedIndex >= 0);
  assert.ok(reserveIndex > submittedIndex);
});

test('settlement fallback reuses vote-reconcile and adds no new Vercel cron', () => {
  const paths = (vercel.crons ?? []).map(
    (entry) => entry.path,
  );

  assert.equal(
    paths.includes('/api/cron/submitted-payout-recovery'),
    false,
  );
  assert.equal(
    paths.includes('/api/cron/vote-reconcile'),
    true,
  );
});


test('settlement fallback records both success and failure heartbeats', () => {
  assert.match(
    scheduler,
    /markCronJobSucceeded\([\s\S]*SUBMITTED_PAYOUT_RECOVERY_JOB/,
  );
  assert.match(
    scheduler,
    /markCronJobFailed\([\s\S]*SUBMITTED_PAYOUT_RECOVERY_JOB/,
  );
  assert.match(
    scheduler,
    /SUBMITTED_PAYOUT_RECOVERY_FAILED/,
  );
});
