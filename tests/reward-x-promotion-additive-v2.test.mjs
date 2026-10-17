import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261017153000_make_x_promotion_fixed_10_b3tr_additive_v2.sql',
    import.meta.url,
  ),
  'utf8',
);

const exemptionFix = await readFile(
  new URL(
    '../supabase/migrations/20261017153500_allow_x_promotion_budget_unavailable_exemption_v2.sql',
    import.meta.url,
  ),
  'utf8',
);

test('additive v2 migration is gated behind a paused external offer boundary and empty promotion state', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_ADDITIVE_MIGRATION_REQUIRES_EXTERNAL_GATE_PAUSED/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_ADDITIVE_MIGRATION_REQUIRES_EMPTY_PROMOTION_STATE/,
  );
  assert.match(migration, /pg_advisory_xact_lock/);
});

test('v2 preserves the full referral reservation and adds a fixed 10 B3TR bonus', () => {
  assert.match(
    migration,
    /create or replace function public\.calculate_reward_x_promotion_additive_v2/,
  );
  assert.match(
    migration,
    /select\s+v_reservation,\s+v_bonus_wei,\s+0,\s+v_bonus_wei/s,
  );
  assert.match(
    migration,
    /v_bonus_wei constant numeric\(78,0\) := 10000000000000000000/,
  );
  assert.match(
    migration,
    /reward_x_promotion_splits_additive_base_check[\s\S]*base_amount_wei=reservation_amount_wei/,
  );
  assert.match(
    migration,
    /reward_x_promotion_splits_additive_v2_fixed_bonus_check/,
  );
});

test('core referral payout remains the full immutable reservation', () => {
  assert.match(
    migration,
    /v_split\.base_amount_wei<>v_queue\.reserved_amount_wei/,
  );
  assert.doesNotMatch(
    migration,
    /v_split\.base_amount_wei\+v_split\.promotion_amount_wei<>v_queue\.reserved_amount_wei/,
  );
});

test('additive bonus is included in pool and cohort liabilities before it is promised', () => {
  assert.match(
    migration,
    /o\.financial_state in \('RESERVED','HELD'\)/,
  );
  assert.match(
    migration,
    /o\.financial_state in \('RESERVED','HELD','PAID'\)/,
  );
  assert.match(
    migration,
    /v_queue_committed \+\s+v_x_promotion_committed \+\s+v_offset_committed/s,
  );
  assert.match(
    migration,
    /v_committed\+new\.promotion_amount_wei>v_budget/,
  );
});

test('insufficient X campaign budget fails soft without blocking the core reservation', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_BONUS_BUDGET_EXCEEDED/,
  );
  assert.match(
    migration,
    /PROMOTION_BUDGET_UNAVAILABLE/,
  );
  assert.match(
    migration,
    /exception when others[\s\S]*record_reward_x_promotion_split_exemption_v1[\s\S]*return new;/,
  );
});

test('budget-unavailable is accepted by the durable exemption recorder as well as the table constraint', () => {
  assert.match(migration, /PROMOTION_BUDGET_UNAVAILABLE/);
  assert.match(exemptionFix, /PROMOTION_BUDGET_UNAVAILABLE/);
  assert.match(
    exemptionFix,
    /record_reward_x_promotion_split_exemption_v1/,
  );
  assert.match(
    exemptionFix,
    /'x-promotion-additive-v2'/,
  );
});

test('all live policy gates advance to the additive v2 policy identity', () => {
  assert.match(
    migration,
    /reward_x_promotion_policy_version='x-promotion-additive-v2'/,
  );
  assert.match(
    migration,
    /new\.reward_x_promotion_policy_version<>'x-promotion-additive-v2'/,
  );
  assert.doesNotMatch(
    migration,
    /new\.reward_x_promotion_policy_version<>'x-promotion-split-v1'/,
  );
});

test('current audits use additive base preservation and the v2 calculator', () => {
  assert.match(
    migration,
    /public\.calculate_reward_x_promotion_additive_v2/,
  );
  assert.match(
    migration,
    /s\.base_amount_wei<>s\.reservation_amount_wei/,
  );
  assert.match(
    migration,
    /where base_amount_wei<>reservation_amount_wei/,
  );
  assert.match(
    migration,
    /base_amount_wei-reserved_amount_wei/,
  );
  assert.match(
    migration,
    /where promotion_rate_bps<>0/,
  );
});
