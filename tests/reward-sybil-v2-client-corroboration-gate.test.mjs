import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  'supabase/migrations/20261014033000_require_independent_client_restriction_evidence.sql',
  'utf8',
);
const reentry = await readFile(
  'src/lib/sybil/v2/restrictedSiblingReentry.ts', 'utf8',
);

test('cookie-only immediate-switch cannot cause an irreversible blacklist', () => {
  assert.match(migration, /INDEPENDENT_EVIDENCE_REQUIRED/u);
  assert.match(migration, /e\.strength = 'HIGH'/u);
  assert.match(migration, /e\.evidence_family in/u);
  assert.match(migration, /e\.invite_code = v_code/u);
  assert.match(migration, /e\.network = v_network/u);
});

test('restricted reentry requires a corroborated prior case in both app and database', () => {
  assert.match(migration, /r\.reason_codes \?\| array\[/u);
  assert.match(reentry, /function independentlyCorroborated\(/u);
  assert.match(reentry, /const allowAutoRestriction =/u);
  assert.match(reentry, /allowAutoRestriction \? 'HIGH' : 'MEDIUM'/u);
  assert.match(reentry, /SECURITY_CLIENT_RESTRICTED_SIBLING_REENTRY_OBSERVATION/u);
});

test('regression: documented 20 minute replacement is only a signal, never automatic blacklist', () => {
  const firstRestrictedAtMs = Date.parse('2026-10-12T11:55:10.873Z');
  const nextActivatedAtMs = Date.parse('2026-10-12T12:15:11.026Z');
  const elapsedSec = (nextActivatedAtMs - firstRestrictedAtMs) / 1000;
  assert.ok(elapsedSec > 10 * 60);
  assert.ok(elapsedSec < 24 * 60 * 60);
  assert.match(reentry, /switchGapSeconds > 24 \* 60 \* 60/u);
});
