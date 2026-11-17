import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

