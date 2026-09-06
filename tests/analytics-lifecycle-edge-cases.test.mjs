import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [serializedCleanup, zeroResultMaintenance] = await Promise.all([
  read(
    'supabase/migrations/20260906004000_serialize_analytics_exclusion_with_archive_cleanup.sql',
  ),
  read(
    'supabase/migrations/20260906005000_avoid_zero_result_product_refinalization.sql',
  ),
]);

test('administrator exclusion and both destructive cleanup paths share one serialization lock', () => {
  const lockKey = /veinvite_analytics_exclusion_archive_cleanup/g;
  const matches = serializedCleanup.match(lockKey) ?? [];
  assert.ok(
    matches.length >= 3,
    'exclusion, product cleanup and usage cleanup must share the same advisory lock',
  );

  assert.match(
    serializedCleanup,
    /lock table public\.app_usage_sessions in share row exclusive mode;[\s\S]*lock table public\.app_product_events in share row exclusive mode;/,
  );
  assert.match(
    serializedCleanup,
    /product analytics for % must be compacted first/,
  );
});

test('zero-result product days stop being mistaken for unfinished historical rollups', () => {
  assert.match(
    zeroResultMaintenance,
    /not exists \([\s\S]*app_product_event_daily_rollups[\s\S]*and exists \([\s\S]*app_product_events[\s\S]*not exists \([\s\S]*app_usage_excluded_visitors/,
  );
  assert.match(
    zeroResultMaintenance,
    /d\.usage_date >= v_recent_from[\s\S]*or \(/,
  );
  assert.match(
    zeroResultMaintenance,
    /'rawRowsDeleted', 0/,
  );
});

test('edge-case hardening keeps analytics maintenance non-destructive and server-only', () => {
  assert.doesNotMatch(
    zeroResultMaintenance,
    /delete from public\.app_product_events|delete from public\.app_usage_sessions/i,
  );
  assert.match(
    zeroResultMaintenance,
    /revoke all on function public\.finalize_long_term_analytics\(date\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    zeroResultMaintenance,
    /grant execute on function public\.finalize_long_term_analytics\(date\)[\s\S]*to postgres, service_role/,
  );
});
