import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ACTIVE_WINDOW_MS,
  countActiveSharedPoolReferrals,
} from '../src/lib/rewards/activeSharedPoolForecast.ts';

const api = readFileSync('src/app/api/rewards/estimate/route.ts', 'utf8');
const now = Date.parse('2026-11-13T12:00:00.000Z');
const fresh = new Date(now - 60 * 60 * 1000).toISOString();
const old = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
const future = new Date(now + 10 * 60 * 1000).toISOString();

function row(overrides = {}) {
  return {
    status: 'ACTIVATING',
    sybil_status: 'CLEAR',
    reward_status: 'PENDING',
    activated_at: fresh,
    apps_completed_at: null,
    vote_completed_at: null,
    vote_round_id: null,
    ...overrides,
  };
}

function narrowLikeDatabase(rows, roundId) {
  const cutoff = now - ACTIVE_WINDOW_MS;
  return rows.filter((r) =>
    (r.status === 'COMPLETED' && r.vote_round_id === roundId) ||
    (r.status === 'ACTIVATING' &&
      [r.activated_at, r.apps_completed_at, r.vote_completed_at]
        .some((t) => t && Date.parse(t) >= cutoff)),
  );
}

test('narrowed activity sample preserves the original forecast across edge cases', () => {
  assert.equal(ACTIVE_WINDOW_MS, 7 * 24 * 60 * 60 * 1000);
  const rows = [
    row(),
    row({activated_at: old, apps_completed_at: fresh}),
    row({activated_at: old, vote_completed_at: fresh}),
    row({activated_at: old}),
    row({activated_at: future}),
    row({sybil_status: 'BLOCKED'}),
    row({reward_status: 'FORFEITED'}),
    row({status: 'COMPLETED', vote_round_id: 125, activated_at: old}),
    row({status: 'COMPLETED', vote_round_id: 124, activated_at: fresh}),
    row({status: 'CANCELLED'}),
  ];
  assert.equal(countActiveSharedPoolReferrals(rows, 125, now), 4);
  assert.equal(
    countActiveSharedPoolReferrals(narrowLikeDatabase(rows, 125), 125, now),
    countActiveSharedPoolReferrals(rows, 125, now),
  );
});

test('public endpoint reads just recent activity plus target-round completions', () => {
  assert.match(api, /new Date\(nowMs - ACTIVE_WINDOW_MS\)\.toISOString\(\)/);
  assert.match(api, /\.eq\('status', 'ACTIVATING'\)/);
  assert.match(api, /activated_at\.gte/);
  assert.match(api, /apps_completed_at\.gte/);
  assert.match(api, /vote_completed_at\.gte/);
  assert.match(api, /\.eq\('status', 'COMPLETED'\)/);
  assert.match(api, /\.eq\('vote_round_id', Number\(x\.rewardCohortRoundId\)\)/);
  assert.match(api, /recentRows\.length \+ completedRows\.length >= 1000/);
  assert.match(api, /countActiveSharedPoolReferrals/);
  assert.doesNotMatch(api, /\.in\('status', \['ACTIVATING', 'COMPLETED'\]\)/);
  assert.doesNotMatch(api, /commit_reward_reservation\(|commit_reward_shared_pool_v1\(/);
});
