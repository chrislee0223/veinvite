import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260903115000_resolve_qualified_referral_network.sql',
    import.meta.url,
  ),
  'utf8',
);

test('qualified referral network resolves legacy gaps without rewriting raw history', () => {
  assert.match(
    migration,
    /create or replace view public\.qualified_referral_relationships/i,
  );
  assert.match(
    migration,
    /coalesce\(\s*r\.network,\s*e\.network,\s*legacy\.network\s*\) as resolved_network/i,
  );
  assert.match(
    migration,
    /when r\.network is not null then 'LEDGER'/i,
  );
  assert.match(
    migration,
    /when e\.network is not null then 'LIVE_ELIGIBILITY'/i,
  );
  assert.match(
    migration,
    /when legacy\.network is not null then 'LEGACY_BACKFILL'/i,
  );
  assert.match(
    migration,
    /else 'UNRESOLVED'/i,
  );

  assert.doesNotMatch(
    migration,
    /update\s+public\.referral_relationships/i,
  );
  assert.doesNotMatch(
    migration,
    /delete\s+from\s+public\.referral_relationships/i,
  );
  assert.doesNotMatch(
    migration,
    /truncate\s+(?:table\s+)?public\.referral_relationships/i,
  );
});

test('resolved referral projection remains private and security-invoker based', () => {
  assert.match(
    migration,
    /with \(security_invoker = true\)/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.qualified_referral_relationships\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant select on table public\.qualified_referral_relationships\s+to service_role/i,
  );
});
