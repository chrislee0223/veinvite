import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008112000_fix_x_promotion_exact_floor_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion percentage uses exact integer floor semantics', () => {
  assert.match(
    migration,
    /div\(v_reservation \* v_rate_bps::numeric, 10000::numeric\)/,
  );
  assert.doesNotMatch(
    migration,
    /trunc\(v_reservation \* v_rate_bps \/ 10000\)/,
  );
});

test('exact-floor migration preserves cap and positive base guard', () => {
  assert.match(migration, /v_cap_wei/);
  assert.match(migration, /greatest\(v_reservation - 1, 0\)/);
  assert.match(
    migration,
    /v_reservation - v_promotion/,
  );
});

test('existing immutable split rows must match corrected authority', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_EXISTING_SPLIT_RECALC_REQUIRED/,
  );
  assert.match(
    migration,
    /s\.base_amount_wei<>c\.base_amount_wei/,
  );
  assert.match(
    migration,
    /s\.promotion_amount_wei<>c\.promotion_amount_wei/,
  );
});
