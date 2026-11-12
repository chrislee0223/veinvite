import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261112140000_reward_shared_pool_atomic_cutover_staged_disabled.sql',import.meta.url),'utf8');
const reservation=readFileSync(new URL('../src/lib/rewards/rewardReservation.ts',import.meta.url),'utf8');
const boost=readFileSync(new URL('../src/lib/rewards/rewardBoostReserveExecution.ts',import.meta.url),'utf8');
const WEI=10n**18n;
const price=(balance, alreadyFixed, valid, x=10n*WEI)=>{
  if(valid<1n) return 0n;
  const available=balance-alreadyFixed-valid*x;
  return available>0n?available/valid:0n;
};
test('shared pool starts disabled and requires a service-only commit',()=>{
  assert.match(sql,/VALUES \(1,false\) ON CONFLICT \(id\) DO NOTHING/);
  assert.match(sql,/SHARED_POOL_ALGORITHM_NOT_ENABLED/);
  assert.match(sql,/mode','DISABLED'/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.commit_reward_shared_pool_v1[\s\S]*TO service_role/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.commit_reward_shared_pool_v1[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('veinvite_reward_reservation_/);
});
test('quote uses exact physical balance and protects only actual fixed debts and X',()=>{
  const pool=7422867712268098494020n;
  const currentUnpaidX=10n*WEI;
  const one=price(pool,currentUnpaidX,1n);
  assert.equal(one,7402867712268098494020n);
  const two=price(pool,currentUnpaidX,2n);
  assert.equal(two,3696433856134049247010n);
  const afterOne=pool-currentUnpaidX-two-10n*WEI;
  assert.equal(price(afterOne,0n,1n),two); // the reserved base+X moved out of the uncommitted pool
  assert.equal(price(15n*WEI,10n*WEI,1n),0n);
});
test('no old-source collateral or round budget in shared commit',()=>{
  const writer=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.commit_reward_shared_pool_v1('));
  assert.doesNotMatch(writer,/read_reward_boost_reserve_late_quote|read_reward_boost_reserve_bank_stress_reserve_wei|read_reward_cohort_effective_budget_wei/);
  assert.match(writer,/read_reward_reservation_candidates_v2/);
  assert.match(writer,/SHARED_POOL_X_POLICY_UNAVAILABLE/);
  assert.match(writer,/read_outstanding_reward_liability/);
  assert.match(sql,/if p_algorithm_version<>'shared-pool-v1' and v_cohort_committed\+p_amount_wei>v_budget then/);
});
test('round budget and X safeguards bypass only for new shared reservations',()=>{
  assert.match(sql,/if new\.reservation_algorithm_version='shared-pool-v1' then\s+return new;/);
  assert.match(sql,/v_queue\.reservation_algorithm_version='shared-pool-v1'/);
  assert.match(sql,/SHARED_POOL_X_BONUS_PHYSICAL_CAPACITY_EXCEEDED/);
  assert.match(sql,/v_committed\+new\.promotion_amount_wei>v_budget/);
  assert.match(sql,/v_committed\+v_delta>v_budget/);
  assert.match(sql,/IF EXISTS \(SELECT 1 FROM reward_admission_bridge\.shared_pool_settings/);
});
test('API routes new algorithm before historic planning and disables old bank automation',()=>{
  assert.ok(reservation.indexOf("'read_reward_shared_pool_mode_v1'")<reservation.indexOf('const planning = await readPredictiveRewardPlanning({'));
  assert.match(reservation,/'commit_reward_shared_pool_v1'/);
  assert.match(boost,/!runtime\.enabled \|\| \(sharedMode as \{ enabled: boolean \}\)\.enabled/);
});
