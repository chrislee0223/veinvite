import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const foundationPath =
  'supabase/migrations/20261007043133_add_reward_boost_reserve_foundation.sql';
const indexPath =
  'supabase/migrations/20261007043311_index_reward_boost_reserve_receipt_fks.sql';
const hardeningPath =
  'supabase/migrations/20261007043540_harden_reward_boost_reserve_write_boundary.sql';

async function sources() {
  const [foundation, indexes, hardening] = await Promise.all([
    readFile(foundationPath, 'utf8'),
    readFile(indexPath, 'utf8'),
    readFile(hardeningPath, 'utf8'),
  ]);
  return { foundation, indexes, hardening };
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


test('service role cannot bypass the audited reserve RPC boundary', async () => {
  const { hardening } = await sources();

  assert.match(
    hardening,
    /revoke insert on table public\.reward_boost_reserve_ledger[\s\S]*?from service_role/u,
  );
  assert.match(
    hardening,
    /revoke usage, select on sequence public\.reward_boost_reserve_ledger_id_seq[\s\S]*?from service_role/u,
  );
  assert.match(
    hardening,
    /grant execute on function public\.append_reward_boost_reserve_source_sweep/u,
  );
  assert.match(
    hardening,
    /grant execute on function public\.append_reward_boost_reserve_release/u,
  );
});

test('reserve mutation RPCs fail closed while boost is disabled or emergency-paused', async () => {
  const { hardening } = await sources();

  assert.match(
    hardening,
    /if not v_cfg\.reward_boost_reserve_enabled then[\s\S]*?REWARD_BOOST_RESERVE_DISABLED/u,
  );
  assert.match(
    hardening,
    /if v_cfg\.emergency_rewards_paused then[\s\S]*?REWARD_BOOST_RESERVE_PAUSED/u,
  );
  assert.match(
    hardening,
    /if p_network='mainnet' and not v_cfg\.mainnet_funded_rewards_enabled then[\s\S]*?REWARD_BOOST_RESERVE_MAINNET_DISABLED/u,
  );
});

test('reserve mutation RPCs preserve lock ordering with normal reward reservations', async () => {
  const { hardening } = await sources();

  for (const marker of [
    'append_reward_boost_reserve_source_sweep',
    'append_reward_boost_reserve_release',
  ]) {
    const start = hardening.indexOf(marker);
    assert.ok(start >= 0);
    const fragment = hardening.slice(start, start + 7000);
    const rewardLock = fragment.indexOf(
      "'veinvite_reward_reservation_' || p_network",
    );
    const reserveLock = fragment.indexOf(
      "'veinvite_reward_boost_reserve_' || p_network || '_' || p_app_id",
    );
    assert.ok(rewardLock >= 0);
    assert.ok(reserveLock > rewardLock);
  }
});
