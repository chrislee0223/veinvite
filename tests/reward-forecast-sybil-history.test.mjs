import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pendingAgeWeights } from '../src/lib/rewards/rewardForecastPendingWeights.ts';

const migration = await readFile(new URL('../supabase/migrations/20261025113000_reward_forecast_sybil_clean_history.sql', import.meta.url), 'utf8');

test('history fills zero-recipient completed VeBetter rounds and excludes Sybil invalidations', () => {
  assert.match(migration, /with completed_funding_rounds as/);
  assert.match(migration, /a\.vebetter_round_id < \(/);
  assert.match(migration, /max\(latest\.vebetter_round_id\)/);
  assert.match(migration, /left join public\.reward_receipts receipt/);
  assert.match(migration, /from public\.reward_rounds payout_round/);
  assert.match(migration, /payout_round\.app_id = p_app_id/);
  assert.match(migration, /group by funding\.vebetter_round_id/);
  assert.match(migration, /assessment\.state = 'CLEAR'/);
  assert.match(migration, /invalidation\.status = 'ACTIVE'/);
  assert.match(migration, /a\.app_id = p_app_id/);
  assert.doesNotMatch(migration, /from public\.reward_rounds rr/);
});

test('historical payouts and Sybil verdicts are never edited by forecast migration', () => {
  assert.match(migration, /create or replace function public\.read_reward_forecast_history/);
  assert.doesNotMatch(migration, /\b(?:update|delete from|truncate)\s+public\.(?:reward_queue_entries|reward_receipts|invitations|sybil_v2_referral_assessments)/i);
});

test('30+ day unaccepted invitations stop diluting forecast, but stay eligible to accept', () => {
  const now=Date.parse('2026-10-25T00:00:00Z');
  const atAge=(days)=>new Date(now-days*86400000).toISOString();
  assert.deepEqual(pendingAgeWeights(atAge(31),now),{expectedBps:0,stressBps:0,bucket:'old'});
  assert.deepEqual(pendingAgeWeights(atAge(8),now),{expectedBps:50,stressBps:150,bucket:'old'});
  assert.deepEqual(pendingAgeWeights(atAge(2),now),{expectedBps:300,stressBps:700,bucket:'aging'});
  assert.deepEqual(pendingAgeWeights(atAge(0),now),{expectedBps:500,stressBps:1000,bucket:'fresh'});
});
