import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const paths = {
  gate: 'src/components/WalletSessionGate.tsx',
  auth: 'src/hooks/useWalletAuthentication.ts',
  handoff: 'src/components/WalletProviderAccountReconciler.tsx',
  session: 'src/app/api/auth/session/route.ts',
  home: 'src/components/HomeClient.tsx',
  shield: 'src/components/LocaleHydrationShield.tsx',
  serverAuth: 'src/lib/walletAuthServer.ts',
  referral: 'src/app/api/referral-links/route.ts',
};
const entries = await Promise.all(Object.entries(paths).map(async ([key,path]) => [
  key,await readFile(new URL(`../${path}`,import.meta.url),'utf8'),
]));
const files = Object.fromEntries(entries);

test('a refresh, SDK event, pageshow or hidden tab never automatically DELETEs a valid session',()=>{
  assert.doesNotMatch(files.gate,/PASSIVE_DISCONNECT_GRACE_MS|scheduleConfirmedDisconnect|confirmedDisconnected: true/);
  assert.doesNotMatch(files.gate,/addEventListener\(\s*'wallet_disconnected'/);
  assert.doesNotMatch(files.auth,/confirmedDisconnected|ClearWalletSessionOptions/);
  assert.match(files.auth,/if \(\s*!connectedWallet \|\|\s*!WALLET_PATTERN\.test\(connectedWallet\)/);
  assert.match(files.gate,/const disconnectFromVerification =[\s\S]*await clearWalletSession\(\)/);
  assert.match(files.gate,/const chooseAnotherWallet =[\s\S]*await clearWalletSession\(\)/);
  assert.match(files.auth,/method: 'DELETE'/);
});

test('the provider handoff must scope both deletes to the previous wallet, not the incoming signer',()=>{
  assert.match(files.handoff,/session\.authenticated !== true[\s\S]*sessionWallet === targetWallet/);
  assert.match(files.handoff,/cancelActiveWalletAuthentication\(\)/);
  assert.match(files.handoff,/const clearBrowserSession = async \(\) =>/);
  assert.match(files.handoff,/X-VeInvite-Session-Handoff-Wallet': sessionWallet/);
  assert.match(files.handoff,/if \(!\(await clearBrowserSession\(\)\)\) \{/);
  assert.match(files.handoff,/AUTH_HANDOFF_SETTLE_MS/);
  assert.match(files.handoff,/new Event\(WALLET_SESSION_INVALID_EVENT\)/);
});

test('home auto-recovery is bounded and never retries a rejected authentication as transient',()=>{
  assert.match(files.home,/startupRetryAttemptsRef\.current >= 3/);
  assert.match(files.home,/const retryDelays = \[650, 1500, 3000\]/);
  assert.match(files.home,/if \(inviteResponse\.status < 500\)/);
  assert.match(files.home,/if \(linkResponse\.status < 500\)/);
  assert.match(files.home,/!startupRetryAllowedRef\.current/);
  assert.match(files.home,/setInvitesFailed\(false\);\s*setReferralLinkFailed\(false\);\s*void load\(\)/);
  assert.match(files.referral,/idempotent "ensure link"/);
  assert.match(files.shield,/STARTUP_RECOVERY_MS = 18_000/);
  assert.match(files.shield,/STARTUP_ERROR_GRACE_MS = 2_500/);
  assert.match(files.shield,/clearStartupErrorTimer\(\)/);
  assert.match(files.shield,/if \(released \|\| hasInteractiveStartupGate\(\)\)/);
});

const A = '0x'+'a'.repeat(40);
const B = '0x'+'b'.repeat(40);

function sessionRouteHarness(currentWallet){
  const revoked=[];
  const cookies=[];
  const result={getSessionCalls:0,unscopedRevokes:0,updatedWallets:[],revoked,cookies};
  let sessionWallet=currentWallet;
  const Supabase={
    from:(table)=>{
      assert.equal(table,'wallet_auth_sessions');
      return {
        update:(row)=>{
          assert.equal(typeof row.revoked_at,'string');
          return {
            eq(key,val){
              if(key==='wallet_address')result.updatedWallets.push(val);
              if(key==='id')assert.equal(val,7);
              return this;
            },
            async is(field,val){assert.equal(field,'revoked_at');assert.equal(val,null);return {error:null}},
          };
        },
      };
    },
  };
  const NextResponse = {json:(body,opts={})=>{
    const response={status:opts.status??200,body,cookies:{set:(c)=>cookies.push(c)}};
    return response;
  }};
  const mocks={
    'node:crypto':{createHash},
    'next/server':{NextResponse},
    '@/lib/walletAuthServer':{
      getWalletSession:async()=>{result.getSessionCalls++;return sessionWallet?{id:7,walletAddress:sessionWallet}:null;},
      getWalletSessionCookieCount:()=>0,
      readWalletSessionTokens:()=>[],
      revokeWalletSession:async()=>{result.unscopedRevokes++;},
      LEGACY_WALLET_SESSION_COOKIE_NAME:'veinvite_session',
      WALLET_SESSION_COOKIE_NAME:'__Host-veinvite_session',
    },
    '@/lib/supabaseServer':{supabaseAdmin:Supabase},
    '@/lib/securityClientServer':{ensureSecurityClientForWallet:async()=>{}},
    '@/lib/securityClientBestEffort':{settleOptionalSecurityObservation:async()=> 'ok'},
  };
  const context={exports:{},module:{exports:{}},require:(id)=>{
    if(!(id in mocks))throw Error('Unexpected import '+id);
    return mocks[id];
  },console,process:{env:{NODE_ENV:'production'}},URL,Date,JSON};
  context.exports=context.module.exports;
  const source=ts.transpileModule(files.session,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,context,{filename:'session-route-handoff.js'});
  return {...result,DELETE:context.module.exports.DELETE,setSessionWallet:(x)=>{sessionWallet=x}};
}
function req(expected){
  return {nextUrl:{origin:'https://veinvite.vercel.app'},headers:{get:(key)=>{
    if(key==='x-veinvite-session-handoff-wallet')return expected;
    if(key==='origin')return 'https://veinvite.vercel.app';
    return null;
  }}};
}

test('an A->B handoff cannot revoke a newly signed-in B or clear its cookie',async()=>{
  const app=sessionRouteHarness(B);
  const out=await app.DELETE(req(A));
  assert.equal(out.status,409);
  assert.equal(app.unscopedRevokes,0);
  assert.equal(app.updatedWallets.length,0);
  assert.equal(app.cookies.length,0);
});

test('an A->B handoff can only revoke the verified old A session',async()=>{
  const app=sessionRouteHarness(A);
  const out=await app.DELETE(req(A));
  assert.equal(out.status,200);
  assert.deepEqual(app.updatedWallets,[A]);
  assert.equal(app.unscopedRevokes,0);
  assert.equal(app.cookies.length,2);
  assert.ok(app.cookies.every(x=>x.maxAge===0));
});

test('missing cookie, malformed wallet or CSRF origin does not clear newer browser session',async()=>{
  const app=sessionRouteHarness(null);
  const out=await app.DELETE(req(A));
  assert.equal(out.status,409);
  assert.equal(app.cookies.length,0);
  const bad=await app.DELETE(req('bad'));
  assert.equal(bad.status,403);
  assert.equal(app.cookies.length,0);
  const badOrigin=await app.DELETE({nextUrl:{origin:'https://veinvite.vercel.app'},headers:{get:(key)=>{
    if(key==='x-veinvite-session-handoff-wallet')return A;
    if(key==='origin')return 'https://evil.example';
    return null;
  }}});
  assert.equal(badOrigin.status,403);
  assert.equal(app.cookies.length,0);
});

test('explicit logout retains unscoped revocation and clears both cookie formats',async()=>{
  const app=sessionRouteHarness(A);
  const out=await app.DELETE(req(null));
  assert.equal(out.status,200);
  assert.equal(app.unscopedRevokes,1);
  assert.equal(app.cookies.length,2);
  assert.equal(app.updatedWallets.length,0);
});
