import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261112000600_grant_x_share_contract_service_role.sql', import.meta.url),
  'utf8',
);
const initialShareContract = await readFile(
  new URL('../supabase/migrations/20261111233000_fix_x_promotion_share_url_and_retry_monitor.sql', import.meta.url),
  'utf8',
);
const lifecycle = await readFile(
  new URL('../src/lib/rewards/rewardXPromotionLifecycle.ts', import.meta.url),
  'utf8',
);

test('read-only share preflight nested URL matcher is callable by server role', () => {
  assert.match(initialShareContract, /SECURITY INVOKER/);
  assert.match(initialShareContract, /public\.reward_x_promotion_share_url_matches_v1\(/);
  assert.match(migration,
    /GRANT EXECUTE ON FUNCTION public\.reward_x_promotion_share_url_matches_v1\(text,uuid,text,boolean\)[\s\S]*?TO service_role/);
  assert.match(lifecycle, /await ensureXShareContract\(candidate\.inviteCode, false\)/);
  assert.match(lifecycle, /await ensureXShareContract\(candidate\.inviteCode, true\)/);
});

test('grant does not broaden referral or token checker to public wallet clients', () => {
  assert.match(migration,
    /REVOKE ALL ON FUNCTION public\.reward_x_promotion_share_url_matches_v1\(text,uuid,text,boolean\)[\s\S]*?FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(migration, /\bTO (?:anon|authenticated|PUBLIC)\b/);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|ALTER TABLE)\b/i);
  assert.doesNotMatch(migration, /reward_x_promotion_payout_/);
});
