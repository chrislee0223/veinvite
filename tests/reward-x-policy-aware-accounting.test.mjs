import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Historical migrations remain immutable; this test follows the staged
// replacement definitions until the exact production migration is recorded.
const sql = readFileSync('docs/staged-sql/20261124_reward_x_policy_aware_accounting.sql','utf8');
const reader = readFileSync('src/lib/rewards/publicElasticForecastReader.ts','utf8');
const W = 10n ** 18n;
function body(name) {
  const from=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  assert.ok(from>=0,name+' definition missing');
  return sql.slice(from,sql.indexOf('$function$;',sql.indexOf('AS $function$',from)+13)+11);
}

test('quote writers reserve a fixed X amount only for enrolled legacy recipients',()=>{
  for (const [name,count] of [
    ['commit_reward_shared_pool_v1','v_legacy_candidates'],
    ['commit_reward_vote_round_close_batch_v1','v_legacy_verified'],
    ['commit_reward_vote_window_immediate_v1','legacy_potential'],
  ]) {
    const def=body(name);
    assert.match(def,/reward_x_promotion_policy_for_invitation_v3\([ci]\.invite_code\)='x-promotion-additive-v2'/);
    assert.match(def,new RegExp('calculate_reward_policy_aware_quote_v1\\([\\s\\S]*?'+count));
    assert.match(def,/legacyXReserveTotalWei/);
  }
  const elastic=body('commit_reward_elastic_closed_cohort_v1');
  assert.match(elastic,/v_x_reserve:=v_legacy_unfixed_or_unresolved\*v_cfg\.x_option_reserve_wei/);
  assert.doesNotMatch(elastic,/v_x_reserve:=\(v_valid\+v_unresolved\)/);
  const helper=body('calculate_reward_policy_aware_quote_v1');
  assert.match(helper,/p_legacy_count>p_recipient_count/);
  assert.match(helper,/div\(greatest\(p_capacity_wei-p_legacy_count\*p_legacy_reserve_wei,0\),p_recipient_count::numeric\)/);
});

test('lifetime accounting returns only released v3 amounts once; old additive obligations stay separate',()=>{
  const def=body('read_reward_cohort_committed_wei');
  assert.match(def,/v_withheld_released/);
  assert.match(def,/s\.policy_version='x-promotion-withheld-10pct-v3'[\s\S]*?o\.financial_state='RELEASED'[\s\S]*?q\.status in \('AWAITING_CLAIM','QUEUED','ASSIGNED'\)/);
  assert.match(def,/v_queue_committed-v_withheld_released/);
  assert.match(def,/into v_x_promotion_committed[\s\S]*?s\.policy_version='x-promotion-additive-v2'[\s\S]*?o\.financial_state in \('RESERVED','HELD','PAID'\)/);
  assert.doesNotMatch(def,/q\.status='PAID'/);
});

test('mixed gross pricing conserves the pool and respects both immutable reward policies',()=>{
  for(const [count,legacy,expected] of [[1n,0n,1000n],[1n,1n,990n],[2n,0n,500n],[2n,1n,495n],[2n,2n,490n]]){
    const gross=(1000n*W-legacy*10n*W)/count;
    assert.equal(gross,expected*W);
    const newer=count-legacy;
    const x=gross/10n;
    assert.equal(gross-x+x,gross);
    assert.ok(count*gross+legacy*10n*W<=1000n*W);
    assert.equal(newer*(gross-x)+newer*x+legacy*(gross+10n*W),count*gross+legacy*10n*W);
  }
});

test('old immutable fixed quotes are not repriced and new ones record legacy count',()=>{
  const def=body('commit_reward_vote_window_immediate_v1');
  assert.match(def,/IF NOT FOUND THEN[\s\S]*?INSERT INTO reward_admission_bridge\.vote_window_fixed_quotes/);
  assert.match(def,/legacy_participant_count/);
  assert.match(def,/legacy_potential>q\.legacy_participant_count/);
  assert.match(def,/q\.quote_wei,'shared-pool-v1'/);
  assert.doesNotMatch(def,/UPDATE reward_admission_bridge\.vote_window_fixed_quotes/i);
});

test('DB-first forecast rollout keeps legacy response compatibility; private metadata is not returned by the server',()=>{
  const def=body('read_reward_shared_pool_capacity_shadow_v1');
  assert.match(def,/v_x_per_winner := v_settings\.x_option_reserve_wei/);
  assert.match(def,/'prospectiveXReservePerWinnerWei',v_prospective_x_reserve::text/);
  assert.match(reader,/estimatePolicyAwareActiveSharedPoolReward/);
  assert.match(reader,/const policyAware = 'capacityBeforeNewXWei' in x/);
  const response=reader.slice(reader.lastIndexOf("    return {\n      mode: 'ELASTIC_SCENARIOS'"));
  assert.doesNotMatch(response,/promotionPolicyCutoverAt|promotionPolicySunsetAt|legacyXReservePerWinnerWei/);
});
