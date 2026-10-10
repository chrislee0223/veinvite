import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261010113500_harden_x_promotion_share_url_identity_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('canonical promotion URL is bound to the recipient wallet referral key', () => {
  assert.match(migration, /from public\.referral_links r/);
  assert.match(migration, /r\.referral_key=v_referral_key/);
  assert.match(migration, /lower\(r\.inviter_wallet\)=v_wallet/);
  assert.match(migration, /r\.status<>'REVOKED'/);
  assert.match(migration, /p_require_active/);
  assert.match(migration, /r\.status='ACTIVE'/);
});

test('initial verification requires an active owned referral URL', () => {
  assert.match(
    migration,
    /record_reward_x_promotion_initial_post_verification_v2[\s\S]*v_recipient_wallet[\s\S]*true/,
  );
});

test('final verification requires the same URL observed initially', () => {
  assert.match(
    migration,
    /finalize_reward_x_promotion_post_verification_v2[\s\S]*p\.matched_expanded_url[\s\S]*btrim\(p_matched_expanded_url\)<>btrim\(v_initial_url\)/,
  );
  assert.match(
    migration,
    /v_recipient_wallet[\s\S]*false/,
  );
});

test('legacy verification entrypoints are not callable by service role', () => {
  assert.match(
    migration,
    /revoke all on function public\.record_reward_x_promotion_initial_post_verification_v1[\s\S]*service_role/,
  );
  assert.match(
    migration,
    /revoke all on function public\.finalize_reward_x_promotion_post_verification_v1[\s\S]*service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_reward_x_promotion_initial_post_verification_v2[\s\S]*service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.finalize_reward_x_promotion_post_verification_v2[\s\S]*service_role/,
  );
});
