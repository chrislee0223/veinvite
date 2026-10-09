import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009122500_require_x_promotion_current_sybil_clearance_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion final verification requires LIVE to remain disabled during migration', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SYBIL_HARDENING_REQUIRES_LIVE_DISABLED/,
  );
});

test('final verification requires current invitation Sybil state CLEAR', () => {
  assert.match(
    migration,
    /v_invitation\.sybil_status<>'CLEAR'/,
  );
});

test('final verification requires the current Sybil v2 assessment to be CLEAR', () => {
  assert.match(
    migration,
    /public\.sybil_v2_enforcement_enabled\(\)/,
  );
  assert.match(
    migration,
    /a\.state='CLEAR'/,
  );
  assert.match(
    migration,
    /c\.assessment_revision=a\.revision/,
  );
  assert.match(
    migration,
    /c\.verdict='CLEAR'/,
  );
});

test('final verification still blocks invalidated and actively restricted referrals', () => {
  assert.match(
    migration,
    /public\.is_sybil_v2_referral_invalidated/,
  );
  assert.match(
    migration,
    /public\.sybil_v2_wallet_restrictions/,
  );
  assert.match(
    migration,
    /r\.status='ACTIVE'/,
  );
});

test('final verifier remains server-only', () => {
  assert.match(
    migration,
    /security definer/,
  );
  assert.match(
    migration,
    /revoke all on function public\.finalize_reward_x_promotion_post_verification_v1\(text,text,text,text\)[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.finalize_reward_x_promotion_post_verification_v1\(text,text,text,text\)[\s\S]*to service_role/,
  );
});
