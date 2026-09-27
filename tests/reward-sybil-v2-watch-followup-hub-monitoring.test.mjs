import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260928143000_add_sybil_v2_watch_followup_and_hub_monitoring.sql';

test('WATCH follow-up stays scoped to the invitee subject at 24h, 7d and 30d', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /operator_sybil_v2_watch_followup_due/u,
  );
  assert.match(
    sql,
    /lower\(i\.invitee_wallet\) as subject_wallet/u,
  );
  assert.match(
    sql,
    /\(values \(24\),\(168\),\(720\)\)/u,
  );
  assert.match(
    sql,
    /a\.state = 'WATCH'/u,
  );
  assert.match(
    sql,
    /AUTOMATIC_SAME_SUBJECT_REVIEW/u,
  );
});

test('WATCH follow-up evidence is observation-only and never auto-restricts rewards or wallets', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const source = await readFile(
    'src/lib/sybil/v2/watchFollowup.ts',
    'utf8',
  );

  assert.match(
    sql,
    /automaticRestriction', false/u,
  );
  assert.doesNotMatch(
    sql,
    /insert\s+into\s+public\.sybil_v2_wallet_restrictions/iu,
  );
  assert.doesNotMatch(
    sql,
    /update\s+public\.reward_/iu,
  );
  assert.doesNotMatch(
    source,
    /\.from\('sybil_v2_wallet_restrictions'\)[\s\S]{0,200}\.insert\(/u,
  );
  assert.doesNotMatch(
    source,
    /\.from\('reward_/u,
  );
});

test('cluster hub candidates exclude allowlisted protocol destinations and remain WATCH-only', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /sybil_v2_cluster_hub_allowlist/u,
  );
  assert.match(
    sql,
    /operator_sybil_v2_cluster_hub_candidates/u,
  );
  assert.match(
    sql,
    /'WATCH'::text as state/u,
  );
  assert.match(
    sql,
    /active_blacklisted_sender_count/u,
  );
  assert.match(
    sql,
    /watched_sender_count/u,
  );
  assert.match(
    sql,
    /automaticRestriction', false/u,
  );
});

test('WATCH follow-up scanner persists same-subject outflows and only flags suspicious destinations', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/watchFollowup.ts',
    'utf8',
  );

  assert.match(
    source,
    /sybil_v2_watch_followup_outflows/u,
  );
  assert.match(
    source,
    /sybil_v2_watch_followup_observations/u,
  );
  assert.match(
    source,
    /WATCH_SUBJECT_TO_INVITER/u,
  );
  assert.match(
    source,
    /WATCH_SUBJECT_TO_ACTIVE_BLACKLIST/u,
  );
  assert.match(
    source,
    /WATCH_SUBJECT_TO_CLUSTER_HUB/u,
  );
});

test('vote recovery drains WATCH follow-up work on the existing five-minute recovery cadence', async () => {
  const source = await readFile(
    'src/app/api/cron/vote-reconcile/route.ts',
    'utf8',
  );

  assert.match(
    source,
    /runSybilV2WatchFollowupBatch/u,
  );
  assert.match(
    source,
    /await runSybilV2WatchFollowupBatch\([\s\S]*?2,[\s\S]*?\)/u,
  );
  assert.match(
    source,
    /watchFollowupMinutes:[\s\S]*RECOVERY_INTERVAL_SECONDS \/ 60/u,
  );
});
