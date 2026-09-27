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

test('WATCH follow-up evidence can trigger reassessment but never auto-restricts or auto-blacklists', async () => {
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
    /await runSybilV2WatchFollowupBatch\([\s\S]*?4,[\s\S]*?\)/u,
  );
  assert.match(
    source,
    /watchFollowupMinutes:[\s\S]*RECOVERY_INTERVAL_SECONDS \/ 60/u,
  );
});


test('WATCH follow-up observations are versioned by assessment revision end-to-end', async () => {
  const versionSql = await readFile(
    'supabase/migrations/20260928150000_version_sybil_v2_watch_followup_by_assessment.sql',
    'utf8',
  );
  const source = await readFile(
    'src/lib/sybil/v2/watchFollowup.ts',
    'utf8',
  );

  assert.match(
    versionSql,
    /unique\(invite_code, assessment_revision, horizon_hours\)/u,
  );
  assert.match(
    versionSql,
    /a\.revision as assessment_revision/u,
  );
  assert.match(
    source,
    /assessment_revision: number \| string/u,
  );
  assert.match(
    source,
    /assessment_revision:[\s\S]*safeNonNegativeInteger\([\s\S]*due\.assessment_revision/u,
  );
  assert.match(
    source,
    /scan_from_block,assessment_revision/u,
  );
});

test('WATCH follow-up excludes active historical BLACKLIST invalidations', async () => {
  const versionSql = await readFile(
    'supabase/migrations/20260928150000_version_sybil_v2_watch_followup_by_assessment.sql',
    'utf8',
  );

  const matches =
    versionSql.match(
      /is_sybil_v2_referral_invalidated/g,
    ) ?? [];

  assert.ok(
    matches.length >= 2,
    'due scheduler and historical follow-up view must both exclude active invalidations',
  );
  assert.match(
    versionSql,
    /operator_sybil_v2_historical_watch_followups/u,
  );
  assert.match(
    versionSql,
    /AUTOMATIC_SAME_SUBJECT_REVIEW/u,
  );
});




test('historical WATCH monitor reports automatic same-subject follow-up mode', async () => {
  const sql = await readFile(
    'supabase/migrations/20260928160000_align_historical_watch_monitor_mode.sql',
    'utf8',
  );

  assert.match(sql, /AUTOMATIC_SAME_SUBJECT_REVIEW/u);
  assert.match(sql, /followupHorizonsHours/u);
  assert.match(sql, /jsonb_build_array\(24,168,720\)/u);
  assert.match(sql, /rewardRecipientEvidenceCombined', false/u);
  assert.doesNotMatch(sql, /MANUAL_SAME_SUBJECT_REVIEW/u);
});

test('WATCH follow-up failures are isolated from core reward recovery health', async () => {
  const source = await readFile(
    'src/app/api/cron/vote-reconcile/route.ts',
    'utf8',
  );

  assert.match(
    source,
    /vote-reconcile:sybil-watch-followup/u,
  );
  assert.match(
    source,
    /warnings\.push\([\s\S]*SYBIL_V2_WATCH_FOLLOWUP_FAILED/u,
  );
  assert.match(
    source,
    /markCronJobFailed\([\s\S]*VOTE_WATCH_FOLLOWUP_JOB/u,
  );
  assert.doesNotMatch(
    source,
    /recoveryFailure \?\?= watchFollowupError/u,
  );
  assert.doesNotMatch(
    source,
    /errors\.push\([\s\S]{0,120}SYBIL_V2_WATCH_FOLLOWUP_FAILED/u,
  );
});


test('flagged WATCH follow-up is persisted as POST_PAYOUT evidence and immediately reassessed', async () => {
  const followup = await readFile(
    'src/lib/sybil/v2/watchFollowup.ts',
    'utf8',
  );
  const pipeline = await readFile(
    'src/lib/sybil/v2/pipeline.ts',
    'utf8',
  );

  assert.match(
    followup,
    /evidence_family: 'POST_PAYOUT'/u,
  );
  assert.match(
    followup,
    /await assessSybilV2Referral\([\s\S]*due\.invite_code/u,
  );
  assert.match(
    pipeline,
    /loadWatchFollowupSignals/u,
  );
  assert.match(
    pipeline,
    /family: 'POST_PAYOUT'/u,
  );
  assert.match(
    pipeline,
    /invitation\.reward_status !== 'PAID'/u,
  );
});

test('paid V2 HOLD resolution uses historical invalidation path without changing past reward', async () => {
  const route = await readFile(
    'src/app/api/admin/sybil/review/route.ts',
    'utf8',
  );

  assert.match(
    route,
    /before\.reward_status === 'PAID'/u,
  );
  assert.match(
    route,
    /resolve_sybil_v2_historical_referral/u,
  );
  assert.match(
    route,
    /WATCH_FOLLOWUP_OPERATOR_BLACKLIST/u,
  );
  assert.match(
    route,
    /pastRewardChanged: false/u,
  );
});

test('cluster-hub follow-up cannot double-count the same historical consolidation relationship', async () => {
  const policy = await readFile(
    'src/lib/sybil/v2/policy.ts',
    'utf8',
  );

  assert.match(
    policy,
    /HISTORICAL_ACTIVITY_CLUSTER_CODES[\s\S]*WATCH_SUBJECT_TO_CLUSTER_HUB/u,
  );
});
