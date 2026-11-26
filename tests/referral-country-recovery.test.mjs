import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = path => readFileSync(path, 'utf8');
const sql = read('supabase/migrations/20261126143500_referral_country_recovery_v1.sql');
const route = read('src/app/api/preferences/country/route.ts');
const client = read('src/components/WalletCountryObservationSync.tsx');
test('late country evidence is separate, immutable, unique, and server-only', () => {
  assert.match(sql, /relationship_id uuid primary key/);
  assert.match(sql, /source_invitation_id uuid not null unique/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.referral_country_recovery_facts from public, anon, authenticated/);
  assert.match(sql, /before update or delete on public\.referral_country_recovery_facts/);
  assert.match(sql, /on conflict \(source_invitation_id\) do nothing/g);
  assert.doesNotMatch(sql, /update public\.(invitations|referral_activation_country_facts|referral_acquisition_country_facts)\s/i);
});
test('capture requires trusted unresolved identity and does not change session renewal', () => {
  assert.match(sql, /new\.country_source is distinct from 'TRUSTED_EDGE'/);
  assert.match(sql, /r\.child_wallet = new\.wallet_address/);
  assert.match(sql, /f\.country_source = 'UNKNOWN' and f\.country_code = 'UNKNOWN'/);
  assert.match(sql, /new\.country_observed_at > r\.relationship_effective_at \+ interval '7 days'/);
  assert.match(sql, /after update of country_code, country_source, country_observed_at/);
  assert.match(sql, /new\.revoked_at is not null/);
  assert.match(sql, /ws\.country_observed_at <= ws\.expires_at/);
});
test('both rankings prefer original evidence and prior rank excludes later recoveries', () => {
  assert.equal([...sql.matchAll(/then f\.country_code[\s\S]*?then a\.country_code[\s\S]*?then b\.country_code/g)].length, 2);
  assert.match(sql, /b\.recorded_at <= \([\s\S]*min\(g\.round_end_at\)/);
  assert.match(sql, /s\.round_end_block=g\.round_end_block/);
  assert.equal([...sql.matchAll(/is_sybil_v2_referral_invalidated/g)].length, 2);
});
test('verified wallet, strict ISO validation and foreground retry', () => {
  assert.match(route, /requireWalletSession\(\{[\s\S]*expectedWallet/);
  assert.match(route, /normalizeIsoCountryCode\(rawCountry\)/);
  assert.match(route, /\.is\('revoked_at', null\)/);
  assert.match(client, /body\.recorded === true/);
  assert.match(client, /syncStarted = await recordCountry\(walletAddress\)/);
  assert.match(client, /document\.visibilityState === 'visible'/);
  assert.match(client, /removeEventListener\('visibilitychange'/);
});
