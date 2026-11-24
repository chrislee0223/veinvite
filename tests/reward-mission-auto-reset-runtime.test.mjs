import test from 'node:test';
import assert from 'node:assert/strict';
import { missionAutoResetSchemaReady } from '../src/lib/rewards/missionAutoResetRuntime.ts';
const prod='https://upfjvkidaqtnbmmnhupz.supabase.co';
test('only reviewed production DB or explicit isolated QA uses new schema',()=>{
 assert.equal(missionAutoResetSchemaReady({VERCEL_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:prod}),true);
 assert.equal(missionAutoResetSchemaReady({VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:prod}),false);
 assert.equal(missionAutoResetSchemaReady({VERCEL_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'}),false);
 assert.equal(missionAutoResetSchemaReady({VERCEL_ENV:'preview',VEINVITE_MISSION_AUTO_RESET_READY:'true'}),true);
 assert.equal(missionAutoResetSchemaReady({VERCEL_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:prod,VEINVITE_MISSION_AUTO_RESET_READY:'false'}),true);
});
