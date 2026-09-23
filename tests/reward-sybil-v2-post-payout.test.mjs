import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  evaluateSybilV2Policy,
} from '../src/lib/sybil/v2/policy.ts';

test('one post-payout sweep signal never becomes HOLD by itself', () => {
  const result = evaluateSybilV2Policy({
    signals: [{
      code: 'RAPID_LARGE_B3TR_SWEEP',
      family: 'POST_PAYOUT',
      strength: 'MEDIUM',
      score: 35,
    }],
    requiredChecksComplete: true,
  });

  assert.equal(result.state, 'WATCH');
  assert.deepEqual(
    result.strongEvidenceFamilies,
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
    new Set(result.strongEvidenceFamilies),
    new Set(['HISTORICAL_REWARD', 'POST_PAYOUT']),
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

  const migration = await readFile(
    'supabase/migrations/20260923060600_add_sybil_v2_post_payout_bridge_queue.sql',
    'utf8',
  );
  assert.match(
    migration,
    /POST_PAYOUT_OBSERVATION_COMPLETE/u,
  );
});

test('recipient B3TR observation defaults on unless explicitly disabled', async () => {
  const source = await readFile(
    'src/lib/sybil/recipientB3trObservationBatch.ts',
    'utf8',
  );

  assert.match(
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
