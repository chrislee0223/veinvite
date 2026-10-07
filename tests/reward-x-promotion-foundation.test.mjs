import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008033000_add_x_promotion_split_foundation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion foundation is disabled by default', () => {
  assert.match(
    migration,
    /reward_x_promotion_enabled boolean not null default false/,
  );
  assert.match(
    migration,
    /reward_x_promotion_shadow_enabled boolean not null default false/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_DISABLED/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SHADOW_DISABLED/,
  );
});

test('split conserves the existing fixed reservation exactly', () => {
  assert.match(
    migration,
    /reservation_amount_wei = base_amount_wei \+ promotion_amount_wei/,
  );
  assert.match(
    migration,
    /v_queue\.reserved_amount_wei<>new\.reservation_amount_wei/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_QUEUE_MISMATCH/,
  );
});

test('split is bound to the original reward cohort and wallet', () => {
  assert.match(
    migration,
    /v_invitation\.reward_cohort_round_id<>new\.source_reward_cohort_round_id/,
  );
  assert.match(
    migration,
    /v_invitation\.reward_funding_allocation_receipt_id<>new\.source_allocation_receipt_id/,
  );
  assert.match(
    migration,
    /lower\(v_invitation\.inviter_wallet\)<>new\.recipient_wallet/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SOURCE_MISMATCH/,
  );
});

test('split policy version must match runtime authority', () => {
  assert.match(
    migration,
    /reward_x_promotion_policy_version text not null default 'x-promotion-split-v1'/,
  );
});

test('runtime policy authority is enforced fail-closed', () => {
  assert.match(migration, /REWARD_X_PROMOTION_POLICY_MISMATCH/);
  assert.match(
    migration,
    /btrim\(new\.policy_version\)<>btrim\(v_cfg\.reward_x_promotion_policy_version\)/,
  );
});

test('live split cannot be attached after payout creation', () => {
  assert.match(
    migration,
    /new\.mode='LIVE'[\s\S]*public\.reward_payouts/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SPLIT_TOO_LATE/,
  );
});

test('split ledger is immutable and server-only', () => {
  assert.match(
    migration,
    /before update or delete on public\.reward_x_promotion_splits/,
  );
  assert.match(
    migration,
    /alter table public\.reward_x_promotion_splits enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.reward_x_promotion_splits[\s\S]*from public,anon,authenticated,service_role/,
  );
  assert.match(
    migration,
    /grant select,insert on table public\.reward_x_promotion_splits to service_role/,
  );
});
