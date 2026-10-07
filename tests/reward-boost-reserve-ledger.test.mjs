import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const foundationPath =
  'supabase/migrations/20261007043133_add_reward_boost_reserve_foundation.sql';
const indexPath =
  'supabase/migrations/20261007043311_index_reward_boost_reserve_receipt_fks.sql';

async function sources() {
  const [foundation, indexes] = await Promise.all([
    readFile(foundationPath, 'utf8'),
    readFile(indexPath, 'utf8'),
  ]);
  return { foundation, indexes };
}

test('reward boost reserve is staged off while shadow observation is on', async () => {
  const { foundation } = await sources();

  assert.match(
    foundation,
    /reward_boost_reserve_enabled boolean not null default false/u,
  );
  assert.match(
    foundation,
    /reward_boost_reserve_shadow_enabled boolean not null default true/u,
  );
  assert.match(
    foundation,
    /reward_boost_reserve_safety_buffer_bps integer not null default 1500/u,
  );
  assert.match(
    foundation,
    /reward_boost_reserve_long_incomplete_rounds integer not null default 2/u,
  );
});

test('reserve ledger is service-only, append-only, and idempotent by reference key', async () => {
  const { foundation } = await sources();

  assert.match(
    foundation,
    /alter table public\.reward_boost_reserve_ledger enable row level security/u,
  );
  assert.match(
    foundation,
    /revoke all on table public\.reward_boost_reserve_ledger[\s\S]*?from public, anon, authenticated, service_role/u,
  );
  assert.match(
    foundation,
    /grant select, insert on table public\.reward_boost_reserve_ledger[\s\S]*?to service_role/u,
  );
  assert.match(
    foundation,
    /unique \(network, app_id, reference_key\)/u,
  );
  assert.match(
    foundation,
    /before update or delete on public\.reward_boost_reserve_ledger/u,
  );
  assert.match(
    foundation,
    /Reward boost reserve ledger % is immutable/u,
  );
});

test('reserve writes serialize with normal reward reservation before reserve lock', async () => {
  const { foundation } = await sources();

  const rewardLock = foundation.indexOf(
    "'veinvite_reward_reservation_' || new.network",
  );
  const reserveLock = foundation.indexOf(
    "'veinvite_reward_boost_reserve_' || new.network || '_' || new.app_id",
  );

  assert.ok(rewardLock >= 0);
  assert.ok(reserveLock > rewardLock);
});

test('source sweeps cannot exceed uncommitted cohort funding and releases cannot exceed bank balance', async () => {
  const { foundation } = await sources();

  assert.match(
    foundation,
    /v_committed := public\.read_reward_cohort_committed_wei/u,
  );
  assert.match(
    foundation,
    /new\.amount_wei > greatest\(v_budget - v_committed,0\)/u,
  );
  assert.match(
    foundation,
    /REWARD_BOOST_RESERVE_SOURCE_EXCEEDED/u,
  );
  assert.match(
    foundation,
    /v_balance := public\.read_reward_boost_reserve_balance_wei/u,
  );
  assert.match(
    foundation,
    /new\.amount_wei > v_balance/u,
  );
  assert.match(
    foundation,
    /REWARD_BOOST_RESERVE_BALANCE_EXCEEDED/u,
  );
});

test('effective cohort budget accounts for reserve inflow and outflow', async () => {
  const { foundation } = await sources();

  assert.match(
    foundation,
    /v_net_flow := public\.read_reward_boost_reserve_cohort_net_flow_wei/u,
  );
  assert.match(
    foundation,
    /v_receipt\.rewards_allocation_amount_wei \+[\s\S]*?v_adjustment \+[\s\S]*?v_net_flow/u,
  );
  assert.match(
    foundation,
    /REWARD_COHORT_EFFECTIVE_BUDGET_NEGATIVE/u,
  );
});

test('allocation receipt foreign keys have direct covering indexes', async () => {
  const { indexes } = await sources();

  assert.match(
    indexes,
    /reward_boost_reserve_ledger_source_receipt_idx[\s\S]*?source_allocation_receipt_id/u,
  );
  assert.match(
    indexes,
    /reward_boost_reserve_ledger_destination_receipt_idx[\s\S]*?destination_allocation_receipt_id/u,
  );
});
