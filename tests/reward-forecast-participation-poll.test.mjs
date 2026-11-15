import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const card = readFileSync('src/components/PublicRewardForecastCard.tsx', 'utf8');
const api = readFileSync('src/app/api/rewards/estimate/route.ts','utf8');
const forecast = readFileSync('src/lib/rewards/activeSharedPoolForecast.ts','utf8');
const writer = readFileSync('src/lib/rewards/rewardReservation.ts','utf8');

test('participation refresh bypasses only client memory; no new chain refresh or cron',()=>{
  assert.match(card,/PARTICIPATION_REFRESH_MS = 3 \* 60_000/);
  assert.match(card,/!bypassMemoryCache &&\s*cachedForecast/);
  assert.match(card,/requestForecast\(bypassMemoryCache\)/);
  assert.match(card,/void loadForecast\(true\)/);
  assert.match(card,/fetch\(\s*'\/api\/rewards\/estimate',/);
  assert.doesNotMatch(card,/\/api\/rewards\/estimate\?refresh=1/);
  assert.doesNotMatch(card,/inFlightForecastWasForced|lastLiveRefreshAt/);
  assert.match(api,/scope: 'public-reward-forecast-live-read'/);
  assert.match(api,/FORECAST_REFRESH_WINDOW_SECONDS = 15 \* 60/);
  assert.match(card,/document\.visibilityState !== 'visible'/);
  assert.match(card,/window\.clearInterval\(participationPollId\)/);
  assert.match(card,/CLIENT_FORECAST_CACHE_MS = 15 \* 60_000/);
  assert.match(card,/now - cachedForecastAt < 60_000/);
  assert.match(card,/inFlightForecast = fetch\(/);
  assert.doesNotMatch(api,/commit_reward_reservation\(|commit_reward_shared_pool_v1\(/);
  assert.match(writer,/commit_reward_shared_pool_v1/);
});

test('read-only API excludes ineligible referrals at DB and calculation levels',()=>{
  assert.match(api,/\.is\('ineligible_at', null\)/);
  assert.match(api,/sybil_status,reward_status,ineligible_at,apps_completed/);
  assert.match(forecast,/row\.ineligible_at != null/);
  assert.match(forecast,/PUBLIC_ACTIVE_FORECAST_MODEL_VERSION = 'shared-pool-recent-accepted-v4'/);
  assert.match(card,/_recent_v4/);
  assert.doesNotMatch(card,/scenarioLowWei|scenarioHighWei|rewardScenarioRange/);
});
