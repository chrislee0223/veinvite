import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [migration, start, callback, feedback] = await Promise.all([
  read('supabase/migrations/20261111040000_x_oauth_service_identity_write_preflight.sql'),
  read('src/app/api/rewards/x-promotion/x-connect/start/route.ts'),
  read('src/app/api/rewards/x-promotion/x-connect/callback/route.ts'),
  read('src/hooks/useXPromotionOAuthReturnFeedback.ts'),
]);

test('production privilege repair is limited to the server role', () => {
  assert.match(migration, /GRANT INSERT ON TABLE public\.reward_x_promotion_x_identities TO service_role/u);
  assert.match(migration, /SECURITY INVOKER/u);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reward_x_promotion_oauth_write_ready_v1\(\)[\s\S]*PUBLIC, anon, authenticated/u);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reward_x_promotion_oauth_write_ready_v1\(\)[\s\S]*TO service_role/u);
  assert.doesNotMatch(migration, /GRANT\s+INSERT[^\n]*TO\s+(anon|authenticated)/iu);
  assert.doesNotMatch(migration, /SECURITY DEFINER/u);
});

test('OAuth start and callback fail closed before X can be billed', () => {
  const rpc = /reward_x_promotion_oauth_write_ready_v1/u;
  assert.match(start, rpc);
  assert.match(callback, rpc);
  assert.match(start, /writeReady\.data !== true[\s\S]*status: 503/u);
  assert.match(callback, /writeReady\.data !== true[\s\S]*finish\(request, 'unavailable'\)/u);
  assert.ok(callback.indexOf('reward_x_promotion_oauth_write_ready_v1') <
    callback.indexOf("https://api.x.com/2/oauth2/token"));
  assert.ok(callback.indexOf('reward_x_promotion_oauth_write_ready_v1') <
    callback.indexOf("reserveXApiReadBudget('OAUTH_USER')"));
});

test('OAuth failures are visible as errors, not as success notices', () => {
  assert.match(feedback, /showFeedback\(\s*'error',\s*status === 'conflict'/u);
  assert.match(feedback, /showFeedback\(\s*'success'/u);
});
