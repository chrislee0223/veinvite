import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009020500_prepare_x_promotion_base_payout_selection_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('migration does not enable X promotion', () => {
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_enabled\s*=\s*true/i,
  );
  assert.doesNotMatch(
    migration,
    /drop trigger[\s\S]*guard_reward_x_promotion_live_activation/i,
  );
});

test('legacy and shadow referrals keep the existing fixed reservation payout', () => {
  assert.match(
    migration,
    /coalesce\(s\.base_amount_wei,q\.reserved_amount_wei\)/,
  );
  assert.match(
    migration,
    /s\.mode='LIVE'/,
  );
});

test('LIVE reservations fail closed when their split is missing', () => {
  assert.match(
    migration,
    /if v_cfg\.reward_x_promotion_enabled then/,
  );
  assert.match(
    migration,
    /q\.reserved_at >= v_cfg\.reward_x_promotion_live_started_at/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_SPLIT_MISSING/,
  );
});

test('round distributable and payout rows use the same effective base amount', () => {
  const effective = /coalesce\(s\.base_amount_wei,q\.reserved_amount_wei\)/g;
  assert.ok((migration.match(effective) ?? []).length >= 2);
  assert.match(
    migration,
    /into v_distributable[\s\S]*insert into public\.reward_payouts/,
  );
});

test('LIVE split is bound to the exact queue row and reservation', () => {
  assert.match(migration, /s\.queue_entry_id=q\.id/);
  assert.match(migration, /s\.invite_code=q\.invite_code/);
  assert.match(migration, /s\.reservation_amount_wei=q\.reserved_amount_wei/);
  assert.match(migration, /s\.recipient_wallet=q\.recipient_wallet/);
});

test('existing liability authority remains in the batch', () => {
  assert.match(
    migration,
    /v_reserved_existing := public\.read_outstanding_reward_liability/,
  );
});
