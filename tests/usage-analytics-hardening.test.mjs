import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [migration, archiveLifecycleMigration, ingestion, operatorReport] = await Promise.all([
  read(
    'supabase/migrations/20260905180000_harden_usage_analytics_integrity.sql',
  ),
  read(
    'supabase/migrations/20260905234521_serialize_archive_lifecycle_without_table_update_privilege.sql',
  ),
  read('src/app/api/analytics/session/route.ts'),
  read('src/app/api/admin/usage-analytics/route.ts'),
]);

test(
  'session timestamps remain monotonic after serialized analytics writes',
  () => {
    assert.match(
      migration,
      /v_now := clock_timestamp\(\);/,
    );
    assert.match(
      migration,
      /pg_advisory_xact_lock/,
    );
    assert.ok(
      migration.indexOf('pg_advisory_xact_lock') <
        migration.indexOf('v_now := clock_timestamp()'),
      'clock timestamp must be captured after the visitor lock',
    );
    assert.match(
      migration,
      /last_seen_at = greatest\([\s\S]*app_usage_sessions\.last_seen_at,[\s\S]*v_now/,
    );
    assert.match(
      migration,
      /ended_at is null or ended_at >= started_at/,
    );
    assert.match(
      migration,
      /last_seen_at >= started_at/,
    );
    assert.match(
      migration,
      /updated_at >= started_at/,
    );
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
  'unreconstructable bootstrap views are omitted transparently instead of guessed',
  () => {
    assert.match(
      migration,
      /create table if not exists public\.app_usage_metric_quality_exclusions/,
    );
    assert.match(
      migration,
      /date '2026-09-03'/,
    );
    assert.match(
      migration,
      /legacy_admin_view_ledger_unavailable/,
    );
    assert.match(
      migration,
      /create or replace function public\.read_app_usage_quality_exclusions/,
    );
    assert.match(
      migration,
      /q\.metric_name = 'view_breakdown'/,
    );
    assert.match(
      operatorReport,
      /read_app_usage_quality_exclusions/,
    );
    assert.match(
      operatorReport,
      /dataQualityExclusions/,
    );
  },
);

test(
  'heartbeat traffic cannot consume the action-event rate-limit budget',
  () => {
    assert.match(
      ingestion,
      /usage-analytics-heartbeat-visitor/,
    );
    assert.match(
      ingestion,
      /usage-analytics-heartbeat-ip/,
    );
    assert.match(
      ingestion,
      /usage-analytics-event-visitor/,
    );
    assert.match(
      ingestion,
      /usage-analytics-event-ip/,
    );
    assert.match(
      ingestion,
      /limit: isHeartbeat \? 180 : 300/,
    );
    assert.match(
      ingestion,
      /limit: isHeartbeat \? 6000 : 2400/,
    );
  },
);

test(
  'hardening preserves the analytics privacy boundary',
  () => {
    assert.doesNotMatch(
      migration,
      /\bwallet_address\s+text\b/i,
    );
    assert.doesNotMatch(
      migration,
      /\bip_address\s+text\b/i,
    );
    assert.doesNotMatch(
      migration,
      /\buser_agent\s+text\b/i,
    );
    assert.doesNotMatch(
      migration,
      /\binvite_code\s+text\b/i,
    );
    assert.match(
      migration,
      /enable row level security/,
    );
    assert.match(
      migration,
      /to service_role/,
    );
  },
);
