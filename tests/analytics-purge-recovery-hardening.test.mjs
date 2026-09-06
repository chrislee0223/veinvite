import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  purgeLedger,
  recoveryAuthority,
  destructiveCleanupLock,
  maintenanceRoute,
] = await Promise.all([
  read(
    'supabase/migrations/20260906013000_record_analytics_hot_source_purges_and_seal_rollups.sql',
  ),
  read(
    'supabase/migrations/20260906013500_harden_post_purge_archive_recovery_and_event_authority.sql',
  ),
  read(
    'supabase/migrations/20260906014600_disable_destructive_analytics_cleanup_until_archive_ready.sql',
  ),
  read('src/app/api/cron/analytics-maintenance/route.ts'),
]);

test('physical analytics purges are permanently recorded and remain server-only', () => {
  assert.match(
    purgeLedger,
    /create table if not exists public\.veinvite_analytics_hot_source_purge_ledger/,
  );
  assert.match(purgeLedger, /unique\(dataset_key, usage_date\)/);
  assert.match(
    purgeLedger,
    /revoke insert, update, delete, truncate on table public\.veinvite_analytics_hot_source_purge_ledger from service_role/,
  );
  assert.match(
    purgeLedger,
    /grant select on table public\.veinvite_analytics_hot_source_purge_ledger to service_role/,
  );
  assert.match(
    purgeLedger,
    /create trigger veinvite_archive_manifest_events_capture_hot_source_purge[\s\S]*after insert on public\.veinvite_archive_manifest_events/,
  );
  assert.match(
    purgeLedger,
    /if new\.status <> 'HOT_SOURCE_PURGED' then[\s\S]*return new/,
  );
  assert.match(
    purgeLedger,
    /v_archived_row_count <> v_manifest\.source_row_count[\s\S]*v_physical_rows_deleted < v_archived_row_count/,
  );
});

test('purged analytics dates seal every permanent rollup surface', () => {
  for (const table of [
    'app_usage_daily_rollups',
    'app_usage_daily_dimension_rollups',
    'app_usage_daily_view_counts',
    'app_product_event_daily_rollups',
    'app_product_event_daily_dimension_rollups',
    'veinvite_daily_funnel_rollups',
  ]) {
    assert.ok(
      purgeLedger.includes(`'${table}'`),
      `${table} must be covered by the purge seal guard`,
    );
  }

  assert.match(
    purgeLedger,
    /create trigger analytics_rollup_seal_guard before insert or update or delete/,
  );
  assert.match(
    purgeLedger,
    /analytics rollup date % is sealed after % hot-source purge/,
  );
});

test('raw analytics cannot silently reappear after a date has been purged', () => {
  assert.match(
    recoveryAuthority,
    /create trigger app_product_events_prevent_purged_date_reintroduction[\s\S]*before insert on public\.app_product_events/,
  );
  assert.match(
    recoveryAuthority,
    /create trigger app_usage_sessions_prevent_purged_date_reintroduction[\s\S]*before insert or update on public\.app_usage_sessions/,
  );
  assert.match(
    recoveryAuthority,
    /raw analytics date % is permanently sealed after % hot-source purge/,
  );
});

test('only the bounded compaction transaction can create HOT_SOURCE_PURGED authority', () => {
  assert.match(
    recoveryAuthority,
    /alter function public\.compact_app_product_analytics\(integer\) security definer/,
  );
  assert.match(
    recoveryAuthority,
    /alter function public\.compact_app_usage_analytics\(integer\) security definer/,
  );
  assert.match(
    recoveryAuthority,
    /alter function public\.compact_app_product_analytics\(integer\) set search_path to pg_catalog, public/,
  );
  assert.match(
    recoveryAuthority,
    /alter function public\.compact_app_usage_analytics\(integer\) set search_path to pg_catalog, public/,
  );
  assert.match(
    recoveryAuthority,
    /p_status not in \('PREPARED','UPLOADED','VERIFIED','FAILED','REVOKED'\)/,
  );
  assert.match(
    recoveryAuthority,
    /revoke insert on table public\.veinvite_archive_manifest_events from service_role/,
  );
  assert.doesNotMatch(
    recoveryAuthority,
    /p_status not in \([^\n]*HOT_SOURCE_PURGED/,
  );
});

test('destructive cleanup is disabled at the database permission layer until archive storage is ready', () => {
  assert.match(
    destructiveCleanupLock,
    /revoke execute on function public\.compact_app_usage_analytics\(integer\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    destructiveCleanupLock,
    /revoke execute on function public\.compact_app_product_analytics\(integer\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    destructiveCleanupLock,
    /grant execute on function public\.compact_app_usage_analytics\(integer\) to postgres/,
  );
  assert.match(
    destructiveCleanupLock,
    /grant execute on function public\.compact_app_product_analytics\(integer\) to postgres/,
  );
  assert.doesNotMatch(
    destructiveCleanupLock,
    /grant execute on function public\.compact_app_(?:usage|product)_analytics\(integer\) to service_role/,
  );
});

test('a revoked post-purge archive can recover only with the recorded pre-purge row count', () => {
  assert.match(
    recoveryAuthority,
    /select p\.archived_row_count[\s\S]*into v_purged_archived_count[\s\S]*from public\.veinvite_analytics_hot_source_purge_ledger/,
  );
  assert.match(
    recoveryAuthority,
    /v_manifest\.source_row_count = v_purged_archived_count/,
  );
  assert.match(
    recoveryAuthority,
    /v_current_count = 0[\s\S]*v_physical_count = 0/,
  );
  assert.match(
    recoveryAuthority,
    /artifactChecksumVerified[\s\S]*sourceRowCountVerified/,
  );
});

test('health keeps purged dates observable and scheduled maintenance stays non-destructive', () => {
  assert.match(
    purgeLedger,
    /purged_analytics_dates_without_valid_archive/,
  );
  assert.match(
    maintenanceRoute,
    /purged_analytics_dates_without_valid_archive/,
  );
  assert.match(maintenanceRoute, /destructiveCleanupEnabled: false/);
  assert.match(maintenanceRoute, /longTermReady: false/);
  assert.match(maintenanceRoute, /mode: 'NON_DESTRUCTIVE'/);
  assert.doesNotMatch(
    maintenanceRoute,
    /compact_app_usage_analytics|compact_app_product_analytics/,
  );
});
