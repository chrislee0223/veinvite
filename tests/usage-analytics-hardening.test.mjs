import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  migration,
  archiveLifecycleMigration,
  boundedCleanupMigration,
  dimensionReadMigration,
  recalculationMigration,
  archiveSourceSemanticsMigration,
  ingestion,
  operatorReport,
] = await Promise.all([
  read(
    'supabase/migrations/20260905180000_harden_usage_analytics_integrity.sql',
  ),
  read(
    'supabase/migrations/20260905234521_serialize_archive_lifecycle_without_table_update_privilege.sql',
  ),
  read(
    'supabase/migrations/20260905234902_bound_archive_cleanup_batches.sql',
  ),
  read(
    'supabase/migrations/20260906000437_fix_usage_dimension_rollup_double_counting.sql',
  ),
  read(
    'supabase/migrations/20260906000623_reharden_long_term_analytics_recalculation_after_history_alignment.sql',
  ),
  read(
    'supabase/migrations/20260906002000_bind_analytics_archives_to_filtered_source_semantics.sql',
  ),
  read('src/app/api/analytics/session/route.ts'),
  read('src/app/api/admin/usage-analytics/route.ts'),
]);

test(
  'session timestamps remain monotonic after serialized analytics writes',
  () => {
    assert.match(migration, /v_now := clock_timestamp\(\);/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.ok(
      migration.indexOf('pg_advisory_xact_lock') <
        migration.indexOf('v_now := clock_timestamp()'),
      'clock timestamp must be captured after the visitor lock',
    );
    assert.match(
      migration,
      /last_seen_at = greatest\([\s\S]*app_usage_sessions\.last_seen_at,[\s\S]*v_now/,
    );
    assert.match(migration, /ended_at is null or ended_at >= started_at/);
    assert.match(migration, /last_seen_at >= started_at/);
    assert.match(migration, /updated_at >= started_at/);
  },
);

test(
  'archive lifecycle serialization stays compatible with service-role least privilege',
  () => {
    assert.match(archiveLifecycleMigration, /pg_advisory_xact_lock/);
    assert.match(archiveLifecycleMigration, /veinvite_archive_manifest:/);
    assert.match(
      archiveLifecycleMigration,
      /grant execute on function public\.enforce_archive_manifest_event_transition\(\) to postgres, service_role/,
    );
    assert.doesNotMatch(archiveLifecycleMigration, /for update/i);
    assert.doesNotMatch(
      archiveLifecycleMigration,
      /grant update on table public\.veinvite_archive_manifests/i,
    );
  },
);

test(
  'destructive archive cleanup is daily, bounded and preserves product-before-usage order',
  () => {
    assert.match(
      boundedCleanupMigration,
      /veinvite_archive_analytics_daily_period_check/,
    );
    assert.match(boundedCleanupMigration, /period_start = period_end/);
    assert.match(
      boundedCleanupMigration,
      /lock table public\.app_usage_sessions in share row exclusive mode;[\s\S]*lock table public\.app_product_events in share row exclusive mode;/,
    );
    assert.match(boundedCleanupMigration, /return query select 1, v_deleted;/);
    assert.match(
      boundedCleanupMigration,
      /return query select 1, v_sessions, v_visitors;/,
    );
    assert.match(
      boundedCleanupMigration,
      /product analytics for % must be compacted first/,
    );
    assert.doesNotMatch(boundedCleanupMigration, /for v_day in/);
  },
);

test(
  'dimension reads never add retained raw sessions on top of finalized dimension rollups',
  () => {
    assert.match(
      dimensionReadMigration,
      /not exists \([\s\S]*from public\.app_usage_daily_dimension_rollups r[\s\S]*r\.usage_date = \(s\.started_at at time zone 'Asia\/Seoul'\)::date[\s\S]*r\.dimension_name = p_dimension/,
    );
    assert.match(dimensionReadMigration, /raw_final_locale_visitors/);
    assert.match(dimensionReadMigration, /where p_dimension in \('device', 'source'\)/);
    assert.match(
      dimensionReadMigration,
      /where r\.usage_date between p_from_date and p_to_date[\s\S]*r\.dimension_name = p_dimension/,
    );
    assert.match(
      dimensionReadMigration,
      /revoke all on function public\.read_app_usage_dimension_breakdown\(date, date, text\)[\s\S]*from public, anon, authenticated/,
    );
  },
);

test(
  'product rollup recalculation is full replacement and preserves verified archived history',
  () => {
    const productStart = recalculationMigration.indexOf(
      'create or replace function public.finalize_app_product_analytics_day',
    );
    const funnelStart = recalculationMigration.indexOf(
      'create or replace function public.finalize_veinvite_daily_funnel_day',
    );
    assert.ok(productStart >= 0 && funnelStart > productStart);
    const product = recalculationMigration.slice(productStart, funnelStart);

    assert.match(product, /is_analytics_date_verified_archived/);
    assert.match(product, /preservedArchivedRollup/);
    assert.match(
      product,
      /delete from public\.app_product_event_daily_dimension_rollups[\s\S]*delete from public\.app_product_event_daily_rollups[\s\S]*insert into public\.app_product_event_daily_rollups/,
    );
    assert.doesNotMatch(product, /on conflict[\s\S]*do update/i);
  },
);

test(
  'funnel recalculation cannot erase a verified archived day after raw cleanup',
  () => {
    const funnelStart = recalculationMigration.indexOf(
      'create or replace function public.finalize_veinvite_daily_funnel_day',
    );
    const excludeStart = recalculationMigration.indexOf(
      'create or replace function public.exclude_app_usage_visitor',
    );
    assert.ok(funnelStart >= 0 && excludeStart > funnelStart);
    const funnel = recalculationMigration.slice(funnelStart, excludeStart);

    assert.match(funnel, /'app_usage_sessions', p_usage_date/);
    assert.match(funnel, /'app_product_events', p_usage_date/);
    assert.match(funnel, /preservedArchivedRollup/);
    assert.ok(
      funnel.indexOf('preservedArchivedRollup') <
        funnel.indexOf('delete from public.veinvite_daily_funnel_rollups'),
      'archive guard must run before destructive funnel replacement',
    );
  },
);

test(
  'administrator exclusion re-finalizes every affected completed analytics day',
  () => {
    const excludeStart = recalculationMigration.indexOf(
      'create or replace function public.exclude_app_usage_visitor',
    );
    assert.ok(excludeStart >= 0);
    const exclusion = recalculationMigration.slice(excludeStart);

    assert.match(exclusion, /v_affected_days date\[\]/);
    assert.match(exclusion, /foreach v_day in array v_affected_days loop/);
    assert.match(exclusion, /finalize_app_usage_analytics_day\(v_day\)/);
    assert.match(exclusion, /finalize_app_product_analytics_day\(v_day\)/);
    assert.match(exclusion, /finalize_veinvite_daily_funnel_day\(v_day\)/);
    assert.match(exclusion, /security definer/);
    assert.match(exclusion, /set search_path to 'pg_catalog', 'public'/);
  },
);

test(
  'analytics archives use the same exclusion semantics as live analytics and late exclusions invalidate verification',
  () => {
    assert.match(
      archiveSourceSemanticsMigration,
      /veinvite_archive_analytics_source_filter_check/,
    );
    assert.match(
      archiveSourceSemanticsMigration,
      /sourceFilter[^\n]*exclude_analytics_excluded_visitors_v1/,
    );
    assert.match(
      archiveSourceSemanticsMigration,
      /count\(\*\) filter \(where x\.visitor_key is null\)/,
    );
    assert.match(
      archiveSourceSemanticsMigration,
      /greatest\(max\(s\.updated_at\), max\(x\.excluded_at\)\)/,
    );
    assert.match(
      archiveSourceSemanticsMigration,
      /greatest\(max\(e\.received_at\), max\(x\.excluded_at\)\)/,
    );
    assert.match(
      archiveSourceSemanticsMigration,
      /v_latest_source_change <= v_manifest\.verified_at/,
    );
  },
);

test(
  'unreconstructable bootstrap views are omitted transparently instead of guessed',
  () => {
    assert.match(
      migration,
      /create table if not exists public\.app_usage_metric_quality_exclusions/,
    );
    assert.match(migration, /date '2026-09-03'/);
    assert.match(migration, /legacy_admin_view_ledger_unavailable/);
    assert.match(
      migration,
      /create or replace function public\.read_app_usage_quality_exclusions/,
    );
    assert.match(migration, /q\.metric_name = 'view_breakdown'/);
    assert.match(operatorReport, /read_app_usage_quality_exclusions/);
    assert.match(operatorReport, /dataQualityExclusions/);
  },
);

test(
  'heartbeat traffic cannot consume the action-event rate-limit budget',
  () => {
    assert.match(ingestion, /usage-analytics-heartbeat-visitor/);
    assert.match(ingestion, /usage-analytics-heartbeat-ip/);
    assert.match(ingestion, /usage-analytics-event-visitor/);
    assert.match(ingestion, /usage-analytics-event-ip/);
    assert.match(ingestion, /limit: isHeartbeat \? 180 : 300/);
    assert.match(ingestion, /limit: isHeartbeat \? 6000 : 2400/);
  },
);

test(
  'hardening preserves the analytics privacy boundary',
  () => {
    for (const sql of [
      migration,
      dimensionReadMigration,
      recalculationMigration,
      archiveSourceSemanticsMigration,
    ]) {
      assert.doesNotMatch(sql, /\bwallet_address\s+text\b/i);
      assert.doesNotMatch(sql, /\bip_address\s+text\b/i);
      assert.doesNotMatch(sql, /\buser_agent\s+text\b/i);
      assert.doesNotMatch(sql, /\binvite_code\s+text\b/i);
    }
    assert.match(migration, /enable row level security/);
    assert.match(migration, /to service_role/);
  },
);
