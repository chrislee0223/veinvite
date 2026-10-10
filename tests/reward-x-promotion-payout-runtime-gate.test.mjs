import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261010022000_split_x_promotion_offer_and_payout_gates_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion payout signing has a separate OFF-by-default runtime gate', () => {
  assert.match(
    migration,
    /reward_x_promotion_payout_enabled boolean not null default false/,
  );
  assert.match(
    migration,
    /set reward_x_promotion_payout_enabled=false/,
  );
});

test('payout gate cannot activate before an immutable LIVE start exists', () => {
  assert.match(
    migration,
    /not reward_x_promotion_payout_enabled[\s\S]*reward_x_promotion_live_started_at is not null/,
  );
});

test('payout gate changes are captured in the append-only X runtime audit', () => {
  assert.match(migration, /previous_payout_enabled boolean not null default false/);
  assert.match(migration, /payout_enabled boolean not null default false/);
  assert.match(
    migration,
    /new\.reward_x_promotion_payout_enabled[\s\S]*old\.reward_x_promotion_payout_enabled/,
  );
  assert.match(
    migration,
    /previous_payout_enabled,[\s\S]*payout_enabled,[\s\S]*previous_policy_version/,
  );
  assert.match(
    migration,
    /after update of[\s\S]*reward_x_promotion_payout_enabled/,
  );
});

test('new-offer and payout runtime semantics are documented separately', () => {
  assert.match(migration, /Controls creation of new LIVE X promotion splits\/offers/);
  assert.match(migration, /Controls fresh signing of already-earned X promotion obligations/);
});
