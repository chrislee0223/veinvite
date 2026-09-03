import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, ownerApi] = await Promise.all([
  readFile(
    new URL(
      '../supabase/migrations/20260904201500_serialize_referral_link_ensure.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL('../src/app/api/referral-links/route.ts', import.meta.url),
    'utf8',
  ),
]);

test('permanent referral-link ensure serializes concurrent requests without unique errors', () => {
  assert.match(migration, /create or replace function public\.ensure_active_referral_link/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /veinvite_referral_link_ensure_/i);
  assert.match(migration, /on conflict do nothing/i);
  assert.match(migration, /'KEY_COLLISION'/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /revoke all on function public\.ensure_active_referral_link\(text, text\)[\s\S]*anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.ensure_active_referral_link\(text, text\)[\s\S]*service_role/i);
});

test('owner API delegates creation to the serialized ensure RPC', () => {
  assert.match(ownerApi, /\.rpc\(\s*'ensure_active_referral_link'/i);
  assert.match(ownerApi, /p_inviter_wallet:\s*owner\.wallet/i);
  assert.match(ownerApi, /p_referral_key:\s*key/i);
  assert.match(ownerApi, /result\.reason === 'KEY_COLLISION'/i);
  assert.doesNotMatch(ownerApi, /\.from\('referral_links'\)\s*\.insert/i);
});
