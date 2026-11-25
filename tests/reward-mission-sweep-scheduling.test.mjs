import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
const read=(p)=>readFileSync(p,'utf8');
const worker=read('src/lib/rewards/missionAutoResetSweep.ts');
const route=read('src/app/api/cron/vote-reconcile/route.ts');
const scheduler=read('src/lib/rewards/missionAutoResetSchedule.ts');
const reward=read('src/lib/rewards/rewardBoostReserveScheduler.ts');
const maintenance=read('src/lib/rewards/rewardRecoveryMaintenance.ts');
test('expiry cannot write from progress; active retry completion stays on fast path',()=>{
  const gate=worker.indexOf("if (phase !== 'expiry' || reviewOnly");
  assert.ok(gate>worker.indexOf("record_mission_auto_reset_progress_v1"));
  assert.ok(gate<worker.indexOf("commit_invitation_mission_auto_reset_v1"));
  assert.match(worker,/phase === 'expiry' && latestAttempt === preliminary.targetDappRoundId/);
  assert.match(worker,/classifyPreviousMissionCompletionWindow\(latestProof, settings.minimumFinalityBlocks\)/);
});
test('persistent cursor replaces wall-clock offsets and skips chain when no candidates',()=>{
  assert.match(worker,/query.gt\('invite_code',after\)/);
  assert.match(worker,/selected.length === 0 && cursor !== null\) selected = await readPage\(null\)/);
  assert.doesNotMatch(worker,/Date.now\(\)\s*\/|\.range\(offset/);
  assert.ok(worker.indexOf('if (selected.length === 0) return result')<worker.indexOf('const round = await readVeBetterRoundWindow()'));
  assert.match(scheduler,/\.eq\('last_started_at', state.last_started_at\)/);
  assert.match(scheduler,/MISSION_SWEEP_LEASE_SECONDS = 360/);
});
test('expiry follows replay and fast reward maintenance without a new cron',()=>{
  assert.match(route,/fallbackClaimed && fallback !== null/);
  assert.ok(route.indexOf("runMissionAutoResetSweepSafe('expiry')")>route.indexOf('await runScheduledRewardMaintenance()'));
  assert.match(route,/CADENCE_LEASE_SECONDS = 360/);
  assert.doesNotMatch(read('vercel.json'),/mission-expiry|mission-progress/);
});
test('shadow sync has one owner and audit is change-triggered or 30-minute',()=>{
  assert.doesNotMatch(reward,/runRewardXPromotionShadowSync|runRewardXPromotionShadowAudit/);
  assert.match(maintenance,/SHADOW_AUDIT_INTERVAL_SECONDS = 30 \* 60/);
  assert.match(maintenance,/shadowSync.createdCount > 0 \? 0 : SHADOW_AUDIT_INTERVAL_SECONDS/);
  assert.match(maintenance,/Shadow accounting is non-authoritative/);
});
test('phase runner persists separate cursors, rejects lost ownership and handles failed candidates',async()=>{
  const calls=[];
  let claim=true, lost=false, failed=0;
  const state={mission_sweep_cursor:'ABCDEFG',last_started_at:'2026-11-25T00:00:00Z'};
  const fakeDb={from(table){assert.equal(table,'cron_job_states');return {
    select(){return {eq(){return {maybeSingle:async()=>({data:state,error:null})}}}},
    update(value){calls.push(['update',value.mission_sweep_cursor]);const q={eq(){return q},select(){return q},maybeSingle:async()=>({data:lost?null:{job_name:'ok'},error:null})};return q}
  }}};
  const mocks={
    'server-only':{},
    '@/lib/monitoring/cronHeartbeat':{tryClaimCronJob:async(job,interval,lease)=>{calls.push(['claim',job,interval,lease]);return claim},markCronJobSucceeded:async job=>{calls.push(['success',job])},markCronJobFailed:async job=>{calls.push(['failure',job])}},
    '@/lib/supabaseServer':{supabaseAdmin:fakeDb},
    './missionAutoResetSweep':{runMissionAutoResetSweep:async(limit,phase,cursor)=>{calls.push(['scan',limit,phase,cursor]);return {status:'CHECKED',selected:1,started:0,blocked:1,failed,failedInviteCodes:[],nextCursor:'BCDEFGH'}}},
  };
  const ctx={module:{exports:{}},require:n=>{assert.ok(n in mocks,n);return mocks[n]},console:{error(){}}};ctx.exports=ctx.module.exports;
  runInNewContext(ts.transpileModule(scheduler,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  const run=ctx.module.exports.runMissionAutoResetSweepSafe;
  assert.equal((await run('progress')).failure,null);
  assert.equal(calls.some(x=>x[0]==='scan'&&x[1]===5&&x[2]==='progress'&&x[3]==='ABCDEFG'),true);
  assert.equal((await run('expiry')).failure,null);
  assert.equal(calls.some(x=>x[0]==='scan'&&x[1]===10&&x[2]==='expiry'),true);
  lost=true; assert.ok((await run('expiry')).failure);
  lost=false;failed=1;assert.ok((await run('progress')).failure);
  claim=false;const before=calls.length;assert.equal((await run('progress')).sweep,null);assert.equal(calls.length,before+1);
});
