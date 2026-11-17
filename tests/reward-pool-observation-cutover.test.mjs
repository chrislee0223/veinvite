import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// A regression guard: legacy recipient forecasts must never silently return
// to a public display, a new snapshot writer, or operator monitoring.
const read = (name) => readFileSync(name, 'utf8');
const writer = read('src/lib/rewards/rewardPoolObservation.ts');
const api = read('src/app/api/rewards/estimate/route.ts');
const firstPaint = read('src/lib/rewards/publicRewardForecastFirstPaint.ts');
const monitor = read('src/lib/rewards/operationsMonitoring.ts');
const migration = read('supabase/migrations/20261117131000_pool_observation_cutover.sql');

test('current public display and monitoring use only physical pool observations', () => {
  for (const text of [api, firstPaint, monitor]) {
    assert.doesNotMatch(text, /reward_forecast_snapshots|rewardForecastSnapshot|rewardForecastPolicy/);
    assert.match(text, /rewardPoolObservation|reward_pool_observations/);
  }
  assert.match(api, /readElasticPublicPreview/);
  assert.match(api, /estimatedRewardWei: publicEstimateWei/);
  assert.doesNotMatch(api, /estimatedRewardWei: snapshot\.estimatedRewardWei/);
});

test('new writer never writes or calculates a legacy per-person quote', () => {
  assert.match(writer, /\.from\('reward_pool_observations'\)\.insert\(row\)/);
  assert.match(writer, /readVeInviteRewardPoolStatus/);
  assert.match(writer, /readPredictiveRewardPlanning/);
  assert.doesNotMatch(writer, /reward_forecast_snapshots|estimated_reward_wei|estimatedRewardWei|expected_recipients|calculateRewardForecastPolicy/);
});

test('SQL separates source observations and protects historical top-up receipts', () => {
  assert.match(migration, /create table if not exists public\.reward_pool_observations/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.reward_pool_observations from public, anon, authenticated/);
  assert.match(migration, /read_reward_shared_pool_capacity_shadow_v1/);
  assert.match(migration, /read_reward_elastic_public_scenarios_v1/);
  assert.match(migration, /seal_and_topup_current_reward_cohort/);
  assert.match(migration, /pool_observation_id/);
  assert.doesNotMatch(migration, /delete from public\.reward_forecast_snapshots|truncate public\.reward_forecast_snapshots/i);
});
