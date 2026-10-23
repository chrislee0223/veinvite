import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const src = readFileSync(new URL('../src/app/api/rewards/x-promotion/scan-request/route.ts', import.meta.url),'utf8');
const code = ts.transpileModule(src,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const WALLET='0x1111111111111111111111111111111111111111';
const INVITE='ABCDEFG';
function setup({enabled=true,origin=true,connected=true,held=true,owner=WALLET,deadlineMinutes=60,blocked=null}={}) {
  const stats={writes:0,rates:0};
  const env={
    VEINVITE_X_PROMOTION_SCAN_HINT_ENABLED: enabled?'true':'false',
    VEINVITE_X_PROMOTION_DISCOVERY_MODE:'live',
    VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY:'author',
  };
  const supabaseAdmin={from(name) {
    const query={
      select(){return this;},eq(){return this;},
      async maybeSingle(){
        if(name==='reward_x_promotion_opportunities')return {error:null,data:{
          invite_code:INVITE,recipient_wallet:owner,obligation_id:21,
          post_deadline_at:new Date(Date.now()+deadlineMinutes*60_000).toISOString(),
          opened_at:new Date(Date.now()-60_000).toISOString(),
        }};
        if(name==='reward_x_promotion_oauth_proofs')return {error:null,data:connected?{x_author_id:'1234567890'}:null};
        if(name==='reward_x_promotion_obligations')return {error:null,data:{financial_state:held?'HELD':'RELEASED'}};
        throw Error('unexpected lookup '+name);
      },
      async upsert(data,opts) {
        assert.equal(name,'reward_x_promotion_scan_requests');
        assert.equal(data.invite_code,INVITE);
        assert.equal(data.recipient_wallet,WALLET);
        assert.equal(opts.onConflict,'invite_code');
        assert.equal(opts.ignoreDuplicates,true);
        stats.writes++;
        return {error:null};
      }
    };
    return query;
  }};
  const exports={};
  vm.runInNewContext(code,{
    exports,Date,JSON,String,URL,console:{error(){}},process:{env},
    require(id){
      if(id==='next/server')return { NextResponse:{json(data,init={}){return {status:init.status??200,data};}} };
      if(id==='@/lib/rateLimitServer')return {async enforceRateLimits(){stats.rates++;return blocked;}};
      if(id==='@/lib/vebetter/network')return {getVeBetterNetworkConfig(){return {network:'mainnet'};}};
      if(id==='@/lib/supabaseServer')return {supabaseAdmin};
      if(id==='@/lib/walletAuthServer')return {async requireWalletSession(){return {walletAddress:WALLET};},WalletAuthenticationError:class extends Error{}};
      throw Error('unexpected module '+id);
    },
  });
  const req={
    headers:{get(key){return key==='origin'?(origin?'https://veinvite.vercel.app':'https://invalid.example'):null;}},
    nextUrl:new URL('https://veinvite.vercel.app/api/rewards/x-promotion/scan-request'),
    async json(){return {inviteCode:INVITE};},
  };
  return {run:()=>exports.POST(req),stats};
}
test('verified owner can queue one safe hint without reward mutation',async()=>{
  const x=setup();const r=await x.run();assert.equal(r.status,200);
  assert.equal(r.data.queued,true);assert.equal(x.stats.writes,1);
  assert.doesNotMatch(src,/\.rpc\(/u);
});
test('disabled rollout makes no queue writes or API requests',async()=>{
  const x=setup({enabled:false});assert.equal((await x.run()).status,503);
  assert.equal(x.stats.writes,0);assert.equal(x.stats.rates,0);
});
test('CSRF origin mismatch is rejected before session/DB',async()=>{
  const x=setup({origin:false});assert.equal((await x.run()).status,403);
  assert.equal(x.stats.writes,0);
});
test('unlinked X, expired offer, released obligation or wallet mismatch are denied',async()=>{
  for(const opts of [{connected:false},{held:false},{owner:'0x2222222222222222222222222222222222222222'},{deadlineMinutes:-1}]){
    const x=setup(opts);assert.equal((await x.run()).status,409);
    assert.equal(x.stats.writes,0);
  }
});
test('scan hint remains subject to shared rate limiting',async()=>{
  const x=setup({blocked:{status:429}});assert.equal((await x.run()).status,429);
  assert.equal(x.stats.writes,0);
});
test('production queue leaves immutably guarded opportunity and payout tables unchanged',()=>{
  assert.doesNotMatch(src,/\.from\(['"](?:reward_x_promotion_post_verifications|reward_x_promotion_payout_intents)['"]\)/u);
  assert.doesNotMatch(src,/reserveXApiReadBudget|lookupXPromotionPost|runRewardXPromotionPayout/u);
});
