import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  retentionMigration,
  retentionIndexMigration,
  retentionScopeMigration,
  securityClientServer,
] = await Promise.all([
  read(
    'supabase/migrations/20260907083122_add_security_client_retention_v1.sql',
  ),
  read(
    'supabase/migrations/20260907091639_add_security_client_retention_lookup_index_v1.sql',
  ),
  read(
    'supabase/migrations/20260907091918_tighten_security_client_retention_review_scope_v1.sql',
  ),
  read('src/lib/securityClientServer.ts'),
]);

test('Security Client DB retention matches the fixed 365-day cookie lifetime', () => {
  assert.match(
    securityClientServer,
    /SECURITY_CLIENT_LIFETIME_DAYS\s*=\s*365/,
  );
  assert.match(
    securityClientServer,
    /if \(!existingToken\) \{[\s\S]*setSecurityClientCookie/,
  );
  assert.doesNotMatch(
    securityClientServer,
    /if \(existingToken\)[\s\S]*setSecurityClientCookie/,
  );
  assert.match(
    retentionScopeMigration,
    /where c\.created_at < v_cutoff/,
  );
  assert.doesNotMatch(
    retentionScopeMigration,
    /where c\.last_seen_at < v_cutoff/,
  );
});

test('Security Client retention lookup is indexed by creation time', () => {
  assert.match(
    retentionIndexMigration,
    /security_clients_retention_created_idx/,
  );
  assert.match(
    retentionIndexMigration,
    /security_clients\(created_at, id\)/,
  );
});

test('only actual Security Client reviews defer expiry', () => {
  assert.match(
    retentionScopeMigration,
    /i\.sybil_source = 'SECURITY_CLIENT'/,
  );
  assert.match(
    retentionScopeMigration,
    /i\.identity_link_status = 'REVIEW'/,
  );
  assert.doesNotMatch(
    retentionScopeMigration,
    /identity_link_status in \('REVIEW','UNKNOWN'\)/,
  );
});

test('the foundation migration still contains the bounded audited retention ledger', () => {
  assert.match(
    retentionMigration,
    /security_client_retention_runs/,
  );
  assert.match(
    retentionMigration,
    /p_batch_limit integer default 1000/,
  );
});
