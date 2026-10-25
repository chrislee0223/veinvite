import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FORECAST_MAX_AGE_MS,
  FORECAST_STALE_AFTER_MS,
  forecastSnapshotAgeMs,
  isRestorableRewardForecast,
  isRewardForecastStale,
  needsImmediateLiveForecastRefresh,
} from '../src/lib/rewards/rewardForecastCacheGuards.ts';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const MODEL = 'reward-forecast-v2.4-adaptive-history-3';
const oldTimestamp = (ageMs) => new Date(NOW - ageMs).toISOString();
const stored = (override = {}) => ({
  savedAt: NOW - 30_000,
  generatedAt: oldTimestamp(40_000),
  modelVersion: MODEL,
  expectedModelVersion: MODEL,
  status: 'ready',
  nowMs: NOW,
  ...override,
});

test('restores a fresh current-model public reward snapshot', () => {
  assert.equal(isRestorableRewardForecast(stored()), true);
});

test('rejects a cache created by an older reward forecast model', () => {
  assert.equal(
    isRestorableRewardForecast(stored({ modelVersion: 'reward-forecast-v2.1' })),
    false,
  );
});

test('re-saving a 25-hour old estimate cannot reset its source age', () => {
  assert.equal(
    isRestorableRewardForecast(stored({ savedAt: NOW, generatedAt: oldTimestamp(FORECAST_MAX_AGE_MS + 1) })),
    false,
  );
});

test('an old savedAt cannot be laundered with a new generatedAt', () => {
  assert.equal(
    isRestorableRewardForecast(stored({ savedAt: NOW - FORECAST_MAX_AGE_MS - 1, generatedAt: oldTimestamp(0) })),
    false,
  );
});

test('rejects invalid, future and missing timestamp values', () => {
  assert.equal(forecastSnapshotAgeMs('not-a-date', NOW), null);
  assert.equal(forecastSnapshotAgeMs(null, NOW), null);
  assert.equal(forecastSnapshotAgeMs(new Date(NOW + 5 * 60_000).toISOString(), NOW), null);
  assert.equal(isRestorableRewardForecast(stored({ savedAt: NaN })), false);
});

test('source age over one hour is stale even when savedAt is just now', () => {
  assert.equal(isRewardForecastStale({ generatedAt: oldTimestamp(FORECAST_STALE_AFTER_MS + 1), nowMs: NOW, savedAt: NOW }), true);
});

test('restored saves older than one hour stay stale even with fresh generation', () => {
  assert.equal(isRewardForecastStale({ generatedAt: oldTimestamp(30_000), nowMs: NOW, savedAt: NOW - 61 * 60_000 }), true);
});

test('fresh estimates do not trigger duplicate on-chain requests immediately', () => {
  assert.equal(needsImmediateLiveForecastRefresh({ status: 'ready', generatedAt: oldTimestamp(30_000), nowMs: NOW }), false);
});

test('aging, pending or explicitly stale estimates still request live verification', () => {
  assert.equal(needsImmediateLiveForecastRefresh({ status: 'ready', generatedAt: oldTimestamp(2 * 60_000), nowMs: NOW }), true);
  assert.equal(needsImmediateLiveForecastRefresh({ status: 'pending', generatedAt: oldTimestamp(0), nowMs: NOW }), true);
  assert.equal(needsImmediateLiveForecastRefresh({ status: 'ready', generatedAt: oldTimestamp(5_000), stale: true, nowMs: NOW }), true);
});

test('snapshots past the maximum age are invalid regardless of a cached stale flag', () => {
  assert.equal(forecastSnapshotAgeMs(oldTimestamp(FORECAST_MAX_AGE_MS + 1), NOW), null);
  assert.equal(isRewardForecastStale({ generatedAt: oldTimestamp(FORECAST_MAX_AGE_MS + 1), nowMs: NOW }), true);
});
