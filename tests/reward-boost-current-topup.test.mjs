import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261026191500_reward_current_cohort_audited_topup.sql', import.meta.url),
  'utf8',
);

const rebalancer = readFileSync(
  new URL('../src/lib/rewards/rewardBoostReserveExecution.ts', import.meta.url),
  'utf8',
);

test('current-round funding requires explicit per-round opt-in and is off by default', () => {
  assert.match(migration, /add column if not exists reward_boost_current_topup_target_round_id bigint/);
  assert.match(migration, /v_cfg.reward_boost_current_topup_target_round_id is distinct from v_cohort/);
  assert.match(migration, /COHORT_NOT_EXPLICITLY_APPROVED/);
  assert.match(rebalancer, /runtime.currentTopUpTargetRoundId !== null/);
  assert.match(rebalancer, /latestForecast.projectedFundingRoundId/);
});

test('scheduler calls audited release once, then rebuilds the real public forecast', () => {
  assert.match(rebalancer, /from\('reward_boost_current_topup_plans'\)/);
  assert.match(rebalancer, /if \(existingTopup\)/);
  assert.match(rebalancer, /forecastAt <= postedAt/);
  assert.match(rebalancer, /forecast = await refreshRewardForecastSnapshot/);
  assert.match(rebalancer, /await supabaseAdmin.rpc\('seal_and_topup_current_reward_cohort'/);
  assert.match(rebalancer, /if \(currentTopUpResult.changed === true\) \{\s*forecast = await refreshRewardForecastSnapshot/);
  assert.match(rebalancer, /currentPool.distributionPaused/);
});

const reservationScopeMigration = readFileSync(
  new URL('../supabase/migrations/20261026224500_reward_current_topup_reservation_scope.sql', import.meta.url),
  'utf8',
);

test('current cohort may top up while other globally reserved claims remain protected', () => {
  assert.match(reservationScopeMigration, /if v_committed<>0 then/);
  assert.doesNotMatch(reservationScopeMigration, /if v_committed<>0 or v_reserved<>0 then/);
  assert.match(reservationScopeMigration, /v_reserved is null or v_reserved < 0/);
  assert.match(reservationScopeMigration, /p_observed_pool_balance_wei-v_reserved-v_remaining-v_recent_protected-v_source_retained-v_stress/);
  assert.match(reservationScopeMigration, /REWARD_CURRENT_TOPUP_GLOBAL_RESERVE_INVALID/);
});

const topup = (fresh, bank, stress, liquidity, current, recent, retained, reserved, committed) => {
  if (reserved > 0n || committed > 0n) return 0n;
  const ordinary = bank > stress ? bank - stress : 0n;
  const physical = liquidity > reserved + current + recent + retained + stress
    ? liquidity - reserved - current - recent - retained - stress : 0n;
  return [ordinary, physical, fresh].reduce((min, x) => x < min ? x : min);
};

test('top-up only applies to an uncommitted cohort with a recent matching pool observation', () => {
  assert.match(migration, /v_committed<>0 or v_reserved<>0/);
  assert.match(migration, /v_forecast\.generated_at < now\(\) - interval '30 minutes'/);
  assert.match(migration, /rewardCohortRoundId'\) is distinct from v_cohort::text/);
  assert.match(migration, /v_forecast\.observed_pool_balance_wei is distinct from p_observed_pool_balance_wei/);
  assert.match(migration, /ALREADY_TOPPED_UP/);
  assert.match(migration, /reward_cohort_round_id=v_cohort and t\.allocation_receipt_id=v_alloc\.id/);
});

test('ledger and sealed plan preserve safety barriers', () => {
  assert.match(migration, /reward_boost_current_topup_immutable/);
  assert.match(migration, /REWARD_BOOST_CURRENT_TOPUP_PLAN_MISMATCH/);
  assert.match(migration, /REWARD_BOOST_CURRENT_TOPUP_CAP_EXCEEDED/);
  assert.match(migration, /REWARD_BOOST_RESERVE_STRESS_RESERVE_PROTECTED/);
  assert.match(migration, /reward_boost_reserve_adaptive_v2_enabled/);
  assert.match(migration, /v_source_retained:=public\.read_reward_boost_reserve_source_retained_wei/);
  assert.match(migration, /v_recent_protected:=public\.read_reward_boost_reserve_recent_protected_wei/);
  assert.match(migration, /grant execute on function public\.seal_and_topup_current_reward_cohort.*to service_role/s);
  assert.match(migration, /revoke all on function public\.seal_and_topup_current_reward_cohort.*from public,anon,authenticated/s);
  assert.doesNotMatch(migration, /update public\.reward_boost_reserve_destination_plans/i);
  assert.doesNotMatch(migration, /update public\.invitations/i);
});

test('bank stress protection and historical rights survive randomized scenarios', () => {
  let seed = 2471;
  const rnd = (limit) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return BigInt(seed % limit);
  };
  for (let i = 0; i < 5000; i++) {
    const fresh = rnd(3000);
    const bank = rnd(10000);
    const stress = rnd(1200);
    const liquidity = rnd(12000);
    const current = rnd(3000);
    const recent = rnd(3000);
    const retained = rnd(3000);
    const reserved = rnd(2) === 0n ? 0n : rnd(1000) + 1n;
    const committed = rnd(2) === 0n ? 0n : rnd(1000) + 1n;
    const amount = topup(fresh, bank, stress, liquidity, current, recent, retained, reserved, committed);
    assert.ok(amount >= 0n);
    assert.ok(amount <= fresh);
    assert.ok(amount <= (bank > stress ? bank - stress : 0n));
    assert.ok(amount <= (liquidity > reserved + current + recent + retained + stress
      ? liquidity - reserved - current - recent - retained - stress : 0n));
    if (committed || reserved) assert.equal(amount, 0n);
    assert.ok(bank - amount >= (bank < stress ? bank : stress));
  }
});

test('current indicative cap increases forecast only when matching official budget is authorized', () => {
  const wei = 10n ** 18n;
  const current = 1595598326379602509825n;
  const bank = 567436954632630769818n;
  const stress = 232691422597025366016n;
  const physical = 7669941436139107907550n;
  const recent = 1108054393319168409600n;
  const retained = 1685176573610723997917n;
  const fresh = 638239330551841003930n;
  const amount = topup(fresh, bank, stress, physical, current, recent, retained, 0n, 0n);
  assert.equal(amount, bank - stress);
  assert.ok((current + amount) / 3n > current / 3n);
  assert.equal((current + amount) / 3n / wei, 643n);
});
