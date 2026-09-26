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

test('minute watcher scans finalized governance vote events before loading or reconciling referrals', () => {
  assert.match(route, /AllocationVoteCast/);
  assert.match(
    route,
    /getBlockCompressed\([\s\S]*?'finalized'[\s\S]*?\)/,
  );
  assert.match(
    route,
    /vote_reconcile_scan_checkpoints/,
  );
  const eventReadIndex = route.indexOf(
    'await readFinalizedVoteEvents',
  );
  const activeLoadIndex = route.indexOf(
    'await loadActivePendingInvitations',
  );

  assert.ok(eventReadIndex >= 0);
  assert.ok(activeLoadIndex > eventReadIndex);
  assert.match(
    route,
    /voteEvents\.eventCount === 0[\s\S]*await saveVoteScanCheckpoint/,
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

test('watcher keeps bounded catch-up and event-replay recovery safety nets', () => {
  assert.match(
    route,
    /INITIAL_LOOKBACK_BLOCKS = 360/,
  );
  assert.match(
    route,
    /RECOVERY_INTERVAL_SECONDS = 5 \* 60/,
  );
  assert.match(
    route,
    /FALLBACK_INTERVAL_SECONDS = 30 \* 60/,
  );
  assert.match(
    route,
    /EVENT_RECONCILIATION_BATCH_SIZE = 25/,
  );
  assert.match(
    route,
    /MAX_EVENT_CATCHUP_BLOCKS = 3600/,
  );
  assert.match(
    route,
    /FALLBACK_REPLAY_LOOKBACK_BLOCKS = 720/,
  );
  assert.match(
    route,
    /FALLBACK_CANDIDATE_LIMIT = 500/,
  );
  assert.match(
    route,
    /runSybilV2AssessmentBatch/,
  );
  assert.match(
    route,
    /reserveEligibleReferralRewards/,
  );
  assert.match(
    route,
    /tryClaimCronJob/,
  );
  assert.match(
    route,
    /basis: 'LAST_SUCCESS'/,
  );
  assert.doesNotMatch(
    route,
    /getUTCMinutes|%\s*FALLBACK_INTERVAL|%\s*RECOVERY_INTERVAL/,
  );
  assert.doesNotMatch(
    route,
    /publishLeaderboardRoundSnapshots/,
  );
});


test('persisted vote cursor catches up without skipping outage blocks', () => {
  assert.match(
    route,
    /checkpoint === null\s*\? recoveryFloor\s*:\s*checkpoint \+ 1/,
  );
  assert.match(
    route,
    /const scanToBlock =\s*Math\.min\([\s\S]*MAX_EVENT_CATCHUP_BLOCKS/,
  );
  assert.match(
    route,
    /toBlock: scanToBlock/,
  );
  assert.match(
    route,
    /saveVoteScanCheckpoint\(\s*network,\s*scanToBlock/,
  );
  assert.doesNotMatch(
    route,
    /checkpoint \+ 1,\s*recoveryFloor/,
  );
});

test('thirty-minute fallback replays recent votes and full-syncs only matching wallets', () => {
  assert.match(
    route,
    /async function replayRecentVoteEventsFallback/,
  );
  assert.match(
    route,
    /finalizedBlock -\s*FALLBACK_REPLAY_LOOKBACK_BLOCKS/,
  );
  const replayIndex = route.indexOf(
    'async function replayRecentVoteEventsFallback',
  );
  const replay = route.slice(replayIndex);

  const eventReadIndex = replay.indexOf(
    'await readFinalizedVoteEvents',
  );
  const candidateLoadIndex = replay.indexOf(
    'await loadVoteOnlyFallbackCandidates',
  );
  const matchIndex = replay.indexOf(
    'voteEvents.voters.has',
  );
  const reconcileIndex = replay.indexOf(
    'await reconcileRows',
  );

  assert.ok(eventReadIndex >= 0);
  assert.ok(candidateLoadIndex > eventReadIndex);
  assert.ok(matchIndex > candidateLoadIndex);
  assert.ok(reconcileIndex > matchIndex);
  assert.doesNotMatch(
    route,
    /async function reconcileVoteOnlyCandidates/,
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
