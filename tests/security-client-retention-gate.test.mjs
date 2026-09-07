import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  foundationMigration,
  effectivePolicyMigration,
  maintenanceRoute,
  privacyCopy,
  legalPage,
  legalSheet,
] = await Promise.all([
  read(
    'supabase/migrations/20260907093023_add_security_client_retention_v1.sql',
  ),
  read(
    'supabase/migrations/20260907093048_tighten_security_client_retention_review_scope_v1.sql',
  ),
  read('src/app/api/cron/analytics-maintenance/route.ts'),
  read('src/lib/i18n/privacySecurityClientCopy.ts'),
  read('src/components/LocalizedLegalPage.tsx'),
  read('src/components/LegalDocumentSheet.tsx'),
]);

test('Security Client technical relationships use a 365-day retention policy', () => {
  assert.match(
    foundationMigration,
    /p_retention_days integer default 365/,
  );
  assert.match(
    foundationMigration,
    /delete from public\.security_client_wallet_observations/,
  );
  assert.match(
    foundationMigration,
    /delete from public\.security_clients/,
  );
  assert.doesNotMatch(
    foundationMigration,
    /delete from public\.(invitations|security_identity_assessment_events|sybil_review_events|reward_queue_entries)/,
  );
});

test('effective policy defers only unresolved Security Client reviews', () => {
  assert.match(
    effectivePolicyMigration,
    /i\.status = 'UNDER_REVIEW'/,
  );
  assert.match(
    effectivePolicyMigration,
    /i\.sybil_status = 'REVIEW'/,
  );
  assert.match(
    effectivePolicyMigration,
    /i\.sybil_source = 'SECURITY_CLIENT'/,
  );
  assert.match(
    effectivePolicyMigration,
    /i\.identity_link_status = 'REVIEW'/,
  );
  assert.doesNotMatch(
    effectivePolicyMigration,
    /identity_link_status in \('REVIEW','UNKNOWN'\)/,
  );
  assert.match(
    effectivePolicyMigration,
    /deferredOpenReviewClients/,
  );
});

test('retention execution is serialized, bounded, audited, and service-role only', () => {
  assert.match(
    foundationMigration,
    /pg_advisory_xact_lock/,
  );
  assert.match(
    foundationMigration,
    /limit p_batch_limit/,
  );
  assert.match(
    foundationMigration,
    /security_client_retention_runs_append_only/,
  );
  assert.match(
    foundationMigration,
    /execute function public\.prevent_operator_ledger_mutation\(\)/,
  );
  assert.match(
    foundationMigration,
    /revoke all on function public\.cleanup_security_client_identity_data[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    foundationMigration,
    /grant execute on function public\.cleanup_security_client_identity_data[\s\S]*to service_role/,
  );
});

test('daily maintenance invokes Security Client cleanup with the reviewed fixed policy', () => {
  assert.match(
    maintenanceRoute,
    /cleanup_security_client_identity_data/,
  );
  assert.match(
    maintenanceRoute,
    /p_trigger_source:\s*'VERCEL_CRON'/,
  );
  assert.match(
    maintenanceRoute,
    /p_retention_days:\s*365/,
  );
  assert.match(
    maintenanceRoute,
    /p_batch_limit:\s*1000/,
  );
  assert.match(
    maintenanceRoute,
    /mode:\s*'MIXED_MAINTENANCE'/,
  );
  assert.match(
    maintenanceRoute,
    /analyticsMode:\s*'NON_DESTRUCTIVE'/,
  );
  assert.match(
    maintenanceRoute,
    /securityClientRetentionMode:\s*'TIME_BOUNDED_DELETION'/,
  );
});

test('privacy disclosure states the Security Client limits on both legal surfaces', () => {
  assert.match(privacyCopy, /365 days/);
  assert.match(privacyCopy, /365일/);
  assert.match(privacyCopy, /shared Security Client is only a review signal/i);
  assert.match(privacyCopy, /IP addresses/);
  assert.match(privacyCopy, /IMEI/);
  assert.match(privacyCopy, /browser-fingerprint components/);

  for (const surface of [legalPage, legalSheet]) {
    assert.match(
      surface,
      /PRIVACY_SECURITY_CLIENT_COPY/,
    );
    assert.match(
      surface,
      /security-client-privacy/,
    );
    assert.match(
      surface,
      /securityClientCopy\?\.updated/,
    );
  }
});
