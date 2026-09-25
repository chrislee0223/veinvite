import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260925235607_add_cron_job_state_and_monitoring.sql',
    import.meta.url,
  ),
  'utf8',
);
const heartbeat = await readFile(
  new URL(
    '../src/lib/monitoring/cronHeartbeat.ts',
    import.meta.url,
  ),
  'utf8',
);
const voteCron = await readFile(
  new URL(
    '../src/app/api/cron/vote-reconcile/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const dailyCron = await readFile(
  new URL(
    '../src/app/api/cron/reconcile/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const analyticsCron = await readFile(
  new URL(
    '../src/app/api/cron/analytics-maintenance/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const config = JSON.parse(
  await readFile(
    new URL('../vercel.json', import.meta.url),
    'utf8',
  ),
);

test('cron state is service-only and has no reward authority', () => {
  assert.match(
    migration,
    /create table if not exists public\.cron_job_states/i,
  );
  assert.match(
    migration,
    /alter table public\.cron_job_states enable row level security/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.cron_job_states[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant select, insert, update[\s\S]*to service_role/i,
  );
  assert.match(
    migration,
    /security invoker[\s\S]*try_claim_cron_job/i,
  );
  assert.doesNotMatch(
    migration,
    /reward_queue_entries|reward_payouts|sybil_v2_referral_assessments/i,
  );
});

test('cron cadence claims are based on last success with a bounded lease', () => {
  assert.match(
    migration,
    /last_succeeded_at is null[\s\S]*last_succeeded_at <=[\s\S]*p_min_success_interval_seconds/i,
  );
  assert.match(
    migration,
    /lease_until is null[\s\S]*lease_until <= v_now/i,
  );
  assert.match(
    heartbeat,
    /try_claim_cron_job/,
  );
  assert.match(
    heartbeat,
    /last_succeeded_at/,
  );
  assert.match(
    heartbeat,
    /lease_until: null/,
  );
});

test('vote watcher no longer relies on wall-clock modulo boundaries', () => {
  assert.match(
    voteCron,
    /tryClaimCronJob/,
  );
  assert.match(
    voteCron,
    /FALLBACK_INTERVAL_SECONDS = 30 \* 60/,
  );
  assert.match(
    voteCron,
    /RECOVERY_INTERVAL_SECONDS = 5 \* 60/,
  );
  assert.match(
    voteCron,
    /basis: 'LAST_SUCCESS'/,
  );
  assert.doesNotMatch(
    voteCron,
    /getUTCMinutes|%\s*FALLBACK_INTERVAL|%\s*RECOVERY_INTERVAL/,
  );
  assert.match(
    voteCron,
    /markCronJobFailed[\s\S]*VOTE_FALLBACK_JOB/,
  );
  assert.match(
    voteCron,
    /markCronJobSucceeded[\s\S]*VOTE_RECOVERY_JOB/,
  );
});

test('scheduled routes record heartbeat liveness', () => {
  assert.match(
    voteCron,
    /markCronJobStarted[\s\S]*VOTE_RECONCILE_JOB/,
  );
  assert.match(
    voteCron,
    /markCronJobSucceeded[\s\S]*VOTE_RECONCILE_JOB/,
  );
  assert.match(
    dailyCron,
    /markCronJobStarted[\s\S]*'daily-reconcile'/,
  );
  assert.match(
    dailyCron,
    /markCronJobSucceeded[\s\S]*'daily-reconcile'/,
  );
  assert.match(
    analyticsCron,
    /markCronJobStarted[\s\S]*'analytics-maintenance'/,
  );
  assert.match(
    analyticsCron,
    /markCronJobFailed[\s\S]*'analytics-maintenance'/,
  );
});

test('operator monitoring detects stale cron heartbeats', () => {
  assert.match(
    migration,
    /CRON_VOTE_RECONCILE_STALE/,
  );
  assert.match(
    migration,
    /CRON_SYBIL_REWARD_RECOVERY_STALE/,
  );
  assert.match(
    migration,
    /CRON_VOTE_FALLBACK_STALE/,
  );
  assert.match(
    migration,
    /CRON_DAILY_RECONCILE_STALE/,
  );
  assert.match(
    migration,
    /CRON_ANALYTICS_MAINTENANCE_STALE/,
  );
  assert.match(
    migration,
    /'cronHealth'/,
  );
});

test('drained paid backfill loses its dedicated schedule but keeps daily recovery', () => {
  assert.equal(
    config.crons.some(
      (entry) =>
        entry.path ===
        '/api/cron/sybil-v2-paid-backfill',
    ),
    false,
  );
  assert.match(
    dailyCron,
    /enqueueSybilV2PaidBackfillBatch\(4\)/,
  );
});
