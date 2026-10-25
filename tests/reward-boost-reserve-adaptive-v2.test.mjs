import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { simulateFutureCohortAdaptiveRelease as simulate } from '../src/lib/rewards/adaptiveBoostReleaseShadow.ts';
const sql=await readFile(new URL('../supabase/migrations/20261025121500_reward_boost_reserve_adaptive_future_v2.sql',import.meta.url),'utf8');
const source=await readFile(new URL('../src/lib/rewards/rewardBoostReserveExecution.ts',import.meta.url),'utf8');
const pricing=await readFile(new URL('../src/lib/rewards/predictivePolicy.ts',import.meta.url),'utf8');
const B=10n**18n;
const input=(o={})=>({enabled:true,policyVersion:'reward-boost-reserve-v2-adaptive',activeCount:0,freshWei:String(554n*B),bankWei:String(1014n*B),stressReserveWei:String(233n*B),physicalHeadroomWei:String(3404n*B),...o});
test('default OFF; old source sweep v1; payout pricing unchanged',()=>{
 assert.match(sql,/reward_boost_reserve_adaptive_v2_enabled boolean not null default false/);
 assert.match(source,/REWARD_BOOST_RESERVE_POLICY_VERSION =\s*'reward-boost-reserve-v1'/);
 assert.match(source,/REWARD_BOOST_RESERVE_DESTINATION_POLICY_VERSION =\s*'reward-boost-reserve-v2-adaptive'/);
 assert.match(pricing,/const MIN_STRESS_RECIPIENTS = 3/);
});
test('immutable existing cohort plan returns unchanged BEFORE adaptive release',()=>{
 const p=sql.indexOf('select * into v_existing');
 const exists=sql.indexOf('if found then',p);
 const ret=sql.indexOf("'changed',false,",exists);
 const policy=sql.indexOf('v_max_release:=least(');
 assert.ok(p>=0 && exists>p && ret>exists && policy>ret);
 assert.doesNotMatch(sql,/\bupdate\s+public\.(?:reward_queue_entries|reward_payouts|reward_boost_reserve_destination_plans)/i);
});
test('authoritative SQL uses locks and hard pool, liability, source and stress guards',()=>{
 for(const pattern of [/pg_advisory_xact_lock/,/v_bank_balance-v_bank_stress/,/v_recent_protected/,/v_source_retained/,/v_physical_unreserved/,/v_reserved_existing/,/trunc\(v_current_pricing\*v_boost_factor_bps\/10000\)/,/v_bank_available,\s*v_physical_headroom/,/adaptiveBoostFactorBps/])assert.match(sql,pattern);
});
test('missing or malformed pipeline fails closed instead of assuming zero demand',()=>{
 assert.match(sql,/REWARD_ADAPTIVE_PIPELINE_UNAVAILABLE/);
 assert.match(sql,/REWARD_ADAPTIVE_PIPELINE_INVALID/);
 assert.match(sql,/is distinct from true/);
});
test('safe boost grows only for genuinely small bound cohorts',()=>{
 const q=simulate(input());assert.equal(q.shadowOnly,true);assert.equal(q.releaseWei,String(781n*B));assert.equal(q.afterBankWei,String(233n*B));
 for(const [n,bps] of [[0,15000],[1,15000],[2,12500],[3,12500],[4,10000],[12,10000]])assert.equal(simulate(input({activeCount:n})).bps,bps);
});
test('disabled, v1 and low resources are always conservative',()=>{
 for(const changes of [{enabled:false},{policyVersion:'reward-boost-reserve-v1'}])assert.equal(simulate(input(changes)).releaseWei,String(554n*B));
 assert.equal(simulate(input({bankWei:String(200n*B)})).releaseWei,'0');
 assert.equal(simulate(input({physicalHeadroomWei:'0'})).releaseWei,'0');
 assert.equal(simulate(input({physicalHeadroomWei:String(10n*B)})).releaseWei,String(10n*B));
 assert.throws(()=>simulate(input({freshWei:'1.2'})),/Invalid Wei/);
 assert.throws(()=>simulate(input({activeCount:-1})),/Invalid active count/);
});
test('1000 fuzzed cases never exceed cash, bank stress, or bounded cohort ceiling',()=>{
 for(let n=1;n<=1000;n++){
   const fresh=BigInt(n*89%100000),bank=BigInt(n*101%200000),stress=BigInt(n*127%90000),physical=BigInt(n*131%110000);
   const q=simulate(input({activeCount:n%20,freshWei:String(fresh),bankWei:String(bank),stressReserveWei:String(stress),physicalHeadroomWei:String(physical)}));
   const released=BigInt(q.releaseWei);
   assert.ok(released<=physical && released<=fresh*BigInt(q.bps)/10000n);
   assert.ok(released <= (bank>stress?bank-stress:0n));
   assert.equal(bank-released,BigInt(q.afterBankWei));
 }
});
