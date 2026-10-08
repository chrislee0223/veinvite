import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009011000_add_x_promotion_live_payout_fail_closed_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('legacy and grandfathered reservations keep the full fixed amount', () => {
  assert.match(
    migration,
    /if not v_cfg\.reward_x_promotion_enabled then[\s\S]*return v_queue\.reserved_amount_wei/,
  );
  assert.match(
    migration,
    /if v_queue\.reserved_at<v_cfg\.reward_x_promotion_live_started_at then[\s\S]*return v_queue\.reserved_amount_wei/,
  );
});

test('LIVE reservations require an exact split and reserved obligation', () => {
  assert.match(migration, /REWARD_X_PROMOTION_LIVE_SPLIT_MISSING/);
  assert.match(migration, /REWARD_X_PROMOTION_LIVE_SPLIT_MISMATCH/);
  assert.match(
    migration,
    /v_split\.base_amount_wei\+v_split\.promotion_amount_wei<>v_queue\.reserved_amount_wei/,
  );
  assert.match(
    migration,
    /v_obligation\.financial_state<>'RESERVED'/,
  );
  assert.match(migration, /REWARD_X_PROMOTION_OBLIGATION_NOT_RESERVED/);
});

test('batch distributable and payout rows use the same authoritative transfer amount', () => {
  const uses = migration.match(
    /public\.read_reward_batch_transfer_amount_wei_v1\(q\.invite_code\)/g,
  ) ?? [];
  assert.ok(uses.length >= 2);
  assert.match(
    migration,
    /select coalesce\(sum\([\s\S]*read_reward_batch_transfer_amount_wei_v1/,
  );
  assert.match(
    migration,
    /insert into public\.reward_payouts[\s\S]*read_reward_batch_transfer_amount_wei_v1\(q\.invite_code\)/,
  );
});

test('DB payout insert guard rejects a queue-backed amount mismatch', () => {
  assert.match(
    migration,
    /before insert on public\.reward_payouts/,
  );
  assert.match(
    migration,
    /new\.amount_wei<>v_expected/,
  );
  assert.match(
    migration,
    /REWARD_PAYOUT_X_PROMOTION_AMOUNT_MISMATCH/,
  );
});

test('truly legacy payouts without a fixed reservation remain untouched', () => {
  assert.match(
    migration,
    /if not found or v_queue\.reserved_amount_wei is null then[\s\S]*return new/,
  );
});

test('LIVE activation without an activation timestamp fails closed', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_START_MISSING/,
  );
});
