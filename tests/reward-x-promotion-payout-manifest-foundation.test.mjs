import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009133010_add_x_promotion_payout_manifest_foundation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('promotion payout manifest foundation remains dormant while LIVE is disabled', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_MANIFEST_FOUNDATION_REQUIRES_LIVE_DISABLED/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_DISABLED/,
  );
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_enabled\s*=\s*true/i,
  );
});

test('manifest freezes one exact structured proof clause', () => {
  assert.match(
    migration,
    /veinvite-x-promotion-payout-manifest-v1/,
  );
  assert.match(
    migration,
    /veinvite:x-promotion:v1:proof:/,
  );
  assert.match(
    migration,
    /https:\/\/veinvite\.vercel\.app\/promotion-proofs\//,
  );
  assert.match(
    migration,
    /VeInvite verified X promotion bonus\./,
  );
  assert.match(
    migration,
    /clause->>'recipientWallet'=recipient_wallet/,
  );
  assert.match(
    migration,
    /clause->>'amountWei'=amount_wei::text/,
  );
  assert.match(
    migration,
    /clause->>'to'=x2earn_rewards_pool_address/,
  );
  assert.match(
    migration,
    /clause #>> '\{proofTypes,0\}'='text'/,
  );
  assert.match(
    migration,
    /clause #>> '\{proofTypes,1\}'='link'/,
  );
  assert.match(
    migration,
    /clause->'impactCodes'='\[\]'::jsonb/,
  );
  assert.match(
    migration,
    /clause->'impactValues'='\[\]'::jsonb/,
  );
});

test('manifest identity is bound to the immutable payout intent and VeInvite app', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_MANIFEST_INTENT_MISMATCH/,
  );
  assert.match(
    migration,
    /0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_MANIFEST_APP_MISMATCH/,
  );
});

test('manifest creation rechecks security and cannot happen after signing', () => {
  assert.match(
    migration,
    /reward_x_promotion_security_clear_v1/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_MANIFEST_SECURITY_NOT_CLEAR/,
  );
  assert.match(
    migration,
    /reward_x_promotion_payout_signed_transactions/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_MANIFEST_TOO_LATE/,
  );
});

test('manifest is immutable and cannot be inserted directly by service role', () => {
  assert.match(
    migration,
    /before update or delete on public\.reward_x_promotion_payout_manifests/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_MANIFEST_IMMUTABLE/,
  );
  assert.match(
    migration,
    /alter table public\.reward_x_promotion_payout_manifests enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.reward_x_promotion_payout_manifests[\s\S]*from public,anon,authenticated,service_role/,
  );
  assert.match(
    migration,
    /grant select on table public\.reward_x_promotion_payout_manifests to service_role/,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(?:insert|update|delete)[\s\S]*reward_x_promotion_payout_manifests\s+to\s+service_role/i,
  );
});

test('only the reviewed creation RPC is executable by service role', () => {
  assert.match(
    migration,
    /create or replace function public\.create_reward_x_promotion_payout_manifest_v1/,
  );
  assert.match(
    migration,
    /security definer/,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_reward_x_promotion_payout_manifest_v1/,
  );
  assert.match(
    migration,
    /to service_role/,
  );
});
