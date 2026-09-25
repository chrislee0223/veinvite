import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL(
    '../src/app/api/cron/vote-reconcile/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const vercelConfig = JSON.parse(
  await readFile(
    new URL('../vercel.json', import.meta.url),
    'utf8',
  ),
);
const migration = await readFile(
  new URL(
    '../supabase/migrations/20260925173258_add_vote_reconcile_scan_checkpoint.sql',
    import.meta.url,
  ),
  'utf8',
);

test('Pro vote watcher runs every minute without moving daily maintenance', () => {
  const voteCron = vercelConfig.crons.find(
    (entry) =>
      entry.path === '/api/cron/vote-reconcile',
  );
  const dailyCron = vercelConfig.crons.find(
    (entry) =>
      entry.path === '/api/cron/reconcile',
  );

  assert.deepEqual(voteCron, {
    path: '/api/cron/vote-reconcile',
    schedule: '* * * * *',
  });
  assert.deepEqual(dailyCron, {
    path: '/api/cron/reconcile',
    schedule: '17 0 * * *',
  });
});

test('minute watcher scans finalized governance vote events before reconciling referrals', () => {
  assert.match(route, /AllocationVoteCast/);
  assert.match(
    route,
    /getBlockCompressed\([\s\S]*?'finalized'[\s\S]*?\)/,
  );
  assert.match(
    route,
    /vote_reconcile_scan_checkpoints/,
  );
  assert.match(
    route,
    /activeRows\.filter[\s\S]*voteEvents\.voters\.has/,
  );
  assert.match(
    route,
    /await syncInvitationEvidence\(row\)/,
  );
});

test('watcher keeps bounded recovery and direct reconciliation safety nets', () => {
  assert.match(
    route,
    /INITIAL_LOOKBACK_BLOCKS = 360/,
  );
  assert.match(
    route,
    /RECOVERY_INTERVAL_MINUTES = 5/,
  );
  assert.match(
    route,
    /FALLBACK_INTERVAL_MINUTES = 30/,
  );
  assert.match(
    route,
    /runSybilV2AssessmentBatch/,
  );
  assert.match(
    route,
    /reserveEligibleReferralRewards/,
  );
  assert.doesNotMatch(
    route,
    /publishLeaderboardRoundSnapshots/,
  );
});

test('vote cursor is service-only and carries no reward or Sybil authority', () => {
  assert.match(
    migration,
    /create table if not exists public\.vote_reconcile_scan_checkpoints/i,
  );
  assert.match(
    migration,
    /enable row level security/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.vote_reconcile_scan_checkpoints[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant select, insert, update[\s\S]*to service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /reward_queue_entries|reward_payouts|sybil_v2_referral_assessments/i,
  );
});
