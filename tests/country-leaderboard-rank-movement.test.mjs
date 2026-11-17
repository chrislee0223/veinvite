import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { attachCountryRankMovement } from '../src/lib/countryRankMovement.ts';

const fixture = (countryCode, rank) => ({
  rank,
  countryCode,
  completedReferrals: 4,
  newUsers: 3,
  returningUsers: 1,
  currentRoundCompleted: 0,
  previousRank: null,
  rankChange: null,
  rankMovement: 'UNAVAILABLE',
});

test('country ranking shows up, down, same and new based on prior-round rank', () => {
  const countries = [
    fixture('US', 1),
    fixture('TR', 3),
    fixture('VN', 2),
    fixture('NG', 4),
  ];
  const previous = new Map([['US', 3], ['TR', 1], ['VN', 2]]);
  const actual = attachCountryRankMovement(countries, previous);
  assert.deepEqual(
    actual.map(({ rankMovement, rankChange, previousRank }) => ({
      rankMovement, rankChange, previousRank,
    })),
    [
      { rankMovement: 'UP', rankChange: 2, previousRank: 3 },
      { rankMovement: 'DOWN', rankChange: -2, previousRank: 1 },
      { rankMovement: 'SAME', rankChange: 0, previousRank: 2 },
      { rankMovement: 'NEW', rankChange: null, previousRank: null },
    ],
  );
  assert.equal(countries[0].rankMovement, 'UNAVAILABLE', 'pure mapping only');
});

test('missing comparison hides all arrows; unknown country is never ranked', () => {
  const rows = [fixture('US', 1), fixture('ZZ', 5)];
  assert.deepEqual(
    attachCountryRankMovement(rows, null).map((x) => x.rankMovement),
    ['UNAVAILABLE', 'UNAVAILABLE'],
  );
  assert.equal(
    attachCountryRankMovement(rows, new Map([['US', 3], ['ZZ', 4]]))[1].rankMovement,
    'UNAVAILABLE',
  );
});

test('countries with the same shared rank remain SAME, not artificial changes', () => {
  assert.deepEqual(
    attachCountryRankMovement([fixture('US', 2), fixture('TR', 2)],
      new Map([['US', 2], ['TR', 2]])).map((x) => x.rankMovement),
    ['SAME', 'SAME'],
  );
});

test('SQL comparison locks to sealed prior-round blockchain height and paid receipts', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20261117150000_country_rank_movement_previous_round_v1.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /ranking_algorithm_version = 'recognized_referrals_v3'/);
  assert.match(sql, /rs\.block_number <= p\.round_end_block/);
  assert.match(sql, /join public\.reward_payout_transaction_settlements rs/);
  assert.match(sql, /public\.is_sybil_v2_referral_invalidated/);
  assert.match(sql, /rank\(\) over \(order by completed_referrals desc\)/);
  assert.match(sql, /from anon;/);
  assert.match(sql, /to service_role;/);
});

test('country API fails closed on comparison errors without affecting totals', () => {
  const api = readFileSync(
    new URL('../src/app/api/leaderboard/country/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(api, /let previousRanks: Map<string, number> \| null = null/);
  assert.match(api, /Country rank movement unavailable/);
  assert.match(api, /attachCountryRankMovement\(normalized\.leaders, previousRanks\)/);
  assert.match(api, /normalized = normalizePayload\(data\)/);
});
