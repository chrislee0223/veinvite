import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  evaluateSybilV2Policy,
} from '../src/lib/sybil/v2/policy.ts';

test('one MEDIUM post-payout signal stays CLEAR with evidence recorded', () => {
  const result = evaluateSybilV2Policy({
    signals: [{
      code: 'RAPID_LARGE_B3TR_SWEEP',
      family: 'POST_PAYOUT',
      strength: 'MEDIUM',
      score: 35,
    }],
    requiredChecksComplete: true,
  });

  assert.equal(result.state, 'CLEAR');
  assert.deepEqual(
    result.strongEvidenceDomains,
    ['POST_PAYOUT'],
  );
});

test('post-payout evidence can HOLD only with another independent strong family', () => {
  const result = evaluateSybilV2Policy({
    signals: [
      {
        code: 'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER',
        family: 'HISTORICAL_REWARD',
        strength: 'HIGH',
        score: 48,
      },
      {
        code: 'RAPID_LARGE_B3TR_SWEEP',
        family: 'POST_PAYOUT',
        strength: 'MEDIUM',
        score: 35,
      },
    ],
    requiredChecksComplete: true,
  });

  assert.equal(result.state, 'HOLD');
  assert.deepEqual(
    new Set(result.strongEvidenceDomains),
    new Set(['HISTORICAL_ACTIVITY', 'POST_PAYOUT']),
  );
});

test('post-payout blacklist cannot rewrite an already-paid reward', async () => {
  const sql = await readFile(
    'supabase/migrations/20260923060500_add_sybil_v2_post_payout_reviews.sql',
    'utf8',
  );
  const start = sql.indexOf(
    'create or replace function public.resolve_sybil_v2_post_payout_review',
  );
  const end = sql.indexOf(
    'revoke all on function public.record_sybil_v2_post_payout_review',
    start,
  );

  assert.ok(start >= 0 && end > start);

  const resolver = sql.slice(start, end);
  assert.match(
    resolver,
    /v_review\.subject_wallet/u,
  );
  assert.match(
    resolver,
    /'restrictionScope', 'REWARD_RECIPIENT_ONLY'/u,
  );
  assert.match(
    resolver,
    /'pastRewardChanged', false/u,
  );
  assert.doesNotMatch(
    resolver,
    /update public\.invitations/u,
  );
  assert.doesNotMatch(
    resolver,
    /update public\.reward_queue_entries/u,
  );
  assert.doesNotMatch(
    resolver,
    /update public\.reward_payouts/u,
  );
});

test('post-payout bridge is retryable and completion-marked only after processing', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/postPayout.ts',
    'utf8',
  );
  const marker = source.lastIndexOf(
    "signalCode: 'POST_PAYOUT_OBSERVATION_COMPLETE'",
  );
  const cluster = source.lastIndexOf(
    'materializeSharedDestinationCluster',
  );

  assert.ok(marker > cluster);
  assert.match(
    source,
    /operator_sybil_v2_post_payout_candidates/u,
  );
  assert.match(
    source,
    /strongEvidenceDomains\.includes\('POST_PAYOUT'\)/u,
  );
  assert.match(
    source,
    /evidenceDomains: policy\.evidenceDomains/u,
  );

  const migration = await readFile(
    'supabase/migrations/20260923060600_add_sybil_v2_post_payout_bridge_queue.sql',
    'utf8',
  );
  assert.match(
    migration,
    /POST_PAYOUT_OBSERVATION_COMPLETE/u,
  );
});

test('recipient B3TR observation requires explicit server-side opt-in', async () => {
  const source = await readFile(
    'src/lib/sybil/recipientB3trObservationBatch.ts',
    'utf8',
  );

  assert.match(
    source,
    /SYBIL_B3TR_OBSERVATION_ENABLED === 'true'/u,
  );
  assert.doesNotMatch(
    source,
    /SYBIL_B3TR_OBSERVATION_ENABLED !== 'false'/u,
  );
});


test('WATCH rewards receive staged 24h, 7d, and 30d post-payout observation', async () => {
  const sql = await readFile(
    'supabase/migrations/20260923060700_stage_sybil_v2_post_payout_watch_horizons.sql',
    'utf8',
  );

  assert.match(sql, /interval '24 hours'/u);
  assert.match(sql, /interval '7 days'/u);
  assert.match(sql, /interval '30 days'/u);
  assert.match(sql, /sybil_v2_verdict = 'WATCH'/u);
  assert.match(sql, /payout_block_number \+ 8640/u);
  assert.match(sql, /payout_block_number \+ 60480/u);
  assert.match(sql, /payout_block_number \+ 259200/u);
});

test('each post-payout observation horizon gets its own completion marker', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/postPayout.ts',
    'utf8',
  );
  const sql = await readFile(
    'supabase/migrations/20260923060700_stage_sybil_v2_post_payout_watch_horizons.sql',
    'utf8',
  );

  assert.match(
    source,
    /post-payout:complete:\$\{snapshot\.receiptId\}:\$\{snapshot\.scanToBlock\}/u,
  );
  assert.match(
    sql,
    /e\.evidence ->> 'scanToBlock' = f\.scan_to_block::text/u,
  );
});

test('pending Sybil reviews temporarily stop new participation without changing past rewards', async () => {
  const sql = await readFile(
    'supabase/migrations/20260923060800_hold_sybil_v2_participation_and_monitor_post_payout.sql',
    'utf8',
  );
  const source = await readFile(
    'src/lib/sybil/v2/restrictions.ts',
    'utf8',
  );

  assert.match(sql, /PRE_CLAIM_HOLD/u);
  assert.match(sql, /POST_PAYOUT_HOLD/u);
  assert.match(
    sql,
    /operator_sybil_v2_temporary_participation_holds/u,
  );
  assert.match(
    source,
    /operator_sybil_v2_temporary_participation_holds/u,
  );
  assert.match(source, /restriction_kind: 'BLACKLIST'/u);
});

test('post-payout HOLDs and bridge delays are operator-monitoring alerts', async () => {
  const sql = await readFile(
    'supabase/migrations/20260923060800_hold_sybil_v2_participation_and_monitor_post_payout.sql',
    'utf8',
  );

  assert.match(
    sql,
    /SYBIL_V2_POST_PAYOUT_REVIEW_REQUIRED/u,
  );
  assert.match(
    sql,
    /SYBIL_V2_POST_PAYOUT_BRIDGE_STALE/u,
  );
  assert.match(
    sql,
    /SYBIL_V2_POST_PAYOUT_REVIEW_OVER_48H/u,
  );
});


test('automatic post-payout observation excludes historical paid rewards', async () => {
  const sql = await readFile(
    'supabase/migrations/20260923062000_gate_automatic_sybil_v2_post_payout_observation.sql',
    'utf8',
  );

  assert.match(
    sql,
    /sybil_v2_automatic_observation_started_at/u,
  );
  assert.match(
    sql,
    /r\.sybil_v2_enforcement_enabled is true/u,
  );
  assert.match(
    sql,
    /s\.paid_at >= r\.sybil_v2_automatic_observation_started_at/u,
  );
  assert.match(
    sql,
    /Historical paid rewards are excluded for separate operator-controlled backfill/u,
  );
});




test('pre-activation funding evidence is scoped to the invitee subject wallet', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/pipeline.ts',
    'utf8',
  );

  assert.match(
    source,
    /\.eq\('invite_code', invitation\.invite_code\)\s*\.eq\('subject_wallet', subject\)\s*\.eq\('evidence_family', 'FUNDING'\)/u,
  );
});

test('post-payout evidence is scoped to the reward-recipient subject wallet', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/postPayout.ts',
    'utf8',
  );

  assert.match(
    source,
    /\.eq\('subject_wallet', subject\)/u,
  );
  assert.match(
    source,
    /loadAllSignals\(\s*inviteCode,\s*subjectWallet,?\s*\)/u,
  );
  assert.doesNotMatch(
    source,
    /OPERATOR_HISTORICAL_WATCH_BASELINE/u,
  );
  assert.doesNotMatch(
    source,
    /loadOperatorWatchBaseline/u,
  );
  assert.doesNotMatch(
    source,
    /operatorWatchBaselineApplied/u,
  );
});

test('explicit operator WATCH re-enables staged observation for reviewed historical payouts only', async () => {
  const sql = await readFile(
    'supabase/migrations/20260927121000_include_operator_watch_in_post_payout_observation.sql',
    'utf8',
  );

  assert.match(sql, /a\.source = 'OPERATOR'/u);
  assert.match(sql, /a\.state = 'WATCH'/u);
  assert.match(sql, /a\.policy_version = 'sybil-v2\.1'/u);
  assert.match(sql, /postPayoutObservationEnabled/u);
  assert.match(sql, /operator_historical_watch/u);
  assert.match(sql, /interval '24 hours'/u);
  assert.match(sql, /interval '7 days'/u);
  assert.match(sql, /interval '30 days'/u);
});


test('explicit operator WATCH overrides any older clearance verdict for observation', async () => {
  const sql = await readFile(
    'supabase/migrations/20260927122500_prioritize_operator_watch_observation.sql',
    'utf8',
  );

  assert.match(sql, /then 'WATCH'/u);
  assert.match(sql, /else c\.verdict/u);
  assert.match(sql, /postPayoutObservationEnabled/u);
});



test('latest post-payout scheduler keeps referral WATCH separate from reward-recipient observation', async () => {
  const sql = await readFile(
    'supabase/migrations/20260927133500_restore_post_payout_subject_boundary.sql',
    'utf8',
  );

  assert.match(
    sql,
    /s\.paid_at >= r\.sybil_v2_automatic_observation_started_at/u,
  );
  assert.doesNotMatch(sql, /sybil_v2_referral_assessments/u);
  assert.doesNotMatch(sql, /operator_historical_watch/u);
  assert.doesNotMatch(sql, /postPayoutObservationEnabled/u);
});


test('post-payout CLEAR emits an access-restored notification and backfills missed clears', async () => {
  const sql = await readFile(
    'supabase/migrations/20260927135000_notify_post_payout_clearance.sql',
    'utf8',
  );

  assert.match(sql, /new\.state = 'CLEARED'/u);
  assert.match(sql, /SECURITY_INVITER_ACCESS_RESTORED/u);
  assert.match(sql, /postpayout-clear-r/u);
  assert.match(sql, /r\.state = 'CLEARED'/u);
  assert.match(sql, /SECURITY_REVIEW_STARTED/u);
});

test('five-minute vote recovery drains bounded post-payout WATCH work', async () => {
  const source = await readFile(
    'src/app/api/cron/vote-reconcile/route.ts',
    'utf8',
  );

  assert.match(
    source,
    /runB3trRecipientObservationBatch\(\s*3,?\s*\)/u,
  );
  assert.match(
    source,
    /runPostPayoutSybilV2BridgeBatch\(\s*10,?\s*\)/u,
  );
  assert.match(
    source,
    /postPayoutRecoveryMinutes:\s*RECOVERY_INTERVAL_SECONDS \/ 60/u,
  );
  assert.match(
    source,
    /B3TR_RECIPIENT_OBSERVATION_RECOVERY_FAILED/u,
  );
  assert.match(
    source,
    /SYBIL_V2_POST_PAYOUT_RECOVERY_FAILED/u,
  );
});

test('Production explicitly opts into the B3TR observation worker', async () => {
  const vercel = JSON.parse(
    await readFile('vercel.json', 'utf8'),
  );

  assert.equal(
    vercel.env?.SYBIL_B3TR_OBSERVATION_ENABLED,
    'true',
  );
});
