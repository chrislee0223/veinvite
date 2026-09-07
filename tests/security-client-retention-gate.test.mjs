import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  migration,
  maintenanceRoute,
  privacyCopy,
  legalPage,
  legalSheet,
] = await Promise.all([
  read(
    'supabase/migrations/20260907083122_add_security_client_retention_v1.sql',
  ),
  read('src/app/api/cron/analytics-maintenance/route.ts'),
  read('src/lib/i18n/privacySecurityClientCopy.ts'),
  read('src/components/LocalizedLegalPage.tsx'),
  read('src/components/LegalDocumentSheet.tsx'),
]);

test('Security Client technical relationships use a 365-day retention policy', () => {
  assert.match(
    migration,
    /p_retention_days integer default 365/,
  );
  assert.match(
    migration,
    /delete from public\.security_client_wallet_observations/,
  );
  assert.match(
    migration,
    /delete from public\.security_clients/,
  );
  assert.doesNotMatch(
    migration,
    /delete from public\.(invitations|security_identity_assessment_events|sybil_review_events|reward_queue_entries)/,
  );
});

test('unresolved Security Client reviews are deferred instead of losing live evidence', () => {
  assert.match(
    migration,
    /i\.status = 'UNDER_REVIEW'/,
  );
  assert.match(
    migration,
    /i\.sybil_status = 'REVIEW'/,
  );
  assert.match(
    migration,
    /i\.sybil_source = 'SECURITY_CLIENT'/,
  );
  assert.match(
    migration,
    /deferredOpenReviewClients/,
  );
});

test('retention execution is serialized, bounded, audited, and service-role only', () => {
  assert.match(
    migration,
    /pg_advisory_xact_lock/,
  );
  assert.match(
    migration,
    /limit p_batch_limit/,
  );
  assert.match(
    migration,
    /security_client_retention_runs_append_only/,
  );
  assert.match(
    migration,
    /execute function public\.prevent_operator_ledger_mutation\(\)/,
  );
  assert.match(
    migration,
    /revoke all on function public\.cleanup_security_client_identity_data[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
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
    /mode:\s*'NON_DESTRUCTIVE'/,
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
