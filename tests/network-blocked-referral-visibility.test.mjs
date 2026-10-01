import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  'supabase/migrations/20261001141500_harden_blocked_referral_network_visibility.sql',
  'utf8',
);

test('terminal legacy Sybil blocks are excluded by the central network invalidation predicate', () => {
  assert.match(
    migration,
    /create or replace function public\.is_sybil_v2_referral_invalidated/u,
  );
  assert.match(migration, /i\.sybil_status = 'BLOCKED'/u);
  assert.match(migration, /i\.status = 'CANCELLED'/u);
  assert.match(migration, /i\.reward_status = 'FORFEITED'/u);
  assert.match(
    migration,
    /lower\(coalesce\(i\.activation_network,''\)\) = lower\(btrim\(p_network\)\)/u,
  );
});

test('legacy graph compatibility does not rewrite rewards or canonical referral history', () => {
  assert.doesNotMatch(migration, /update\s+public\.reward_/iu);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.reward_/iu);
  assert.doesNotMatch(migration, /update\s+public\.referral_relationships/iu);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.referral_relationships/iu);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.sybil_v2_referral_invalidations/iu);
});
