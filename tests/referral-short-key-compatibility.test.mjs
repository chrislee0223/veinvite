import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [referralLinks, migration] = await Promise.all([
  readFile(new URL('../src/lib/referralLinks.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260910013000_harden_referral_key_validation.sql', import.meta.url), 'utf8'),
]);

const acceptedReferralKey = /^(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})$/;

test('new permanent referral keys remain exactly 16 Base64URL characters', () => {
  assert.match(referralLinks, /new Uint8Array\(12\)/);
  assert.match(
    referralLinks,
    /\^\(\?:\[A-Za-z0-9_-\]\{16\}\|\[A-Za-z0-9_-\]\{22,64\}\)\$/,
  );
});

test('short and legacy referral-key ranges are explicit with no accidental middle range', () => {
  for (const length of [16, 22, 32, 64]) {
    assert.equal(acceptedReferralKey.test('A'.repeat(length)), true, `expected ${length} characters to be accepted`);
  }
  for (const length of [15, 17, 18, 19, 20, 21, 65]) {
    assert.equal(acceptedReferralKey.test('A'.repeat(length)), false, `expected ${length} characters to be rejected`);
  }
  assert.equal(acceptedReferralKey.test('A'.repeat(15) + '!'), false);
});

test('database constraint and both permanent-referral RPCs use the same compatibility rule', () => {
  const sqlRule = /\^\(\[A-Za-z0-9_-\]\{16\}\|\[A-Za-z0-9_-\]\{22,64\}\)\$/g;
  const occurrences = migration.match(sqlRule) ?? [];
  assert.equal(occurrences.length, 3, 'table constraint plus two RPC guards must share the same rule');
  assert.match(migration, /create or replace function public\.ensure_active_referral_link/i);
  assert.match(migration, /create or replace function public\.claim_permanent_referral_with_entry_proof/i);
});

test('compatibility migration does not rewrite existing referral-link rows', () => {
  const beforeEnsureFunction = migration.split(/create or replace function public\.ensure_active_referral_link/i)[0];
  assert.doesNotMatch(beforeEnsureFunction, /update\s+public\.referral_links/i);
  assert.doesNotMatch(beforeEnsureFunction, /delete\s+from\s+public\.referral_links/i);
  assert.doesNotMatch(beforeEnsureFunction, /insert\s+into\s+public\.referral_links/i);
});
