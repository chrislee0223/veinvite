import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261010023500_guard_x_promotion_signed_commit_payout_gate_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('new signed X promotion commitments require both LIVE and payout gates', () => {
  assert.match(
    migration,
    /not v_cfg\.reward_x_promotion_enabled/,
  );
  assert.match(
    migration,
    /not v_cfg\.reward_x_promotion_payout_enabled/,
  );
  assert.match(
    migration,
    /v_cfg\.reward_x_promotion_live_started_at is null/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SIGNING_RUNTIME_DISABLED/,
  );
});

test('runtime commitment guard is enforced by the signed transaction table itself', () => {
  assert.match(
    migration,
    /before insert on public\.reward_x_promotion_payout_signed_transactions/,
  );
  assert.match(
    migration,
    /guard_reward_x_promotion_signed_commit_runtime_v1/,
  );
});

test('guard does not block update-free exact transaction recovery', () => {
  assert.doesNotMatch(
    migration,
    /before update|before delete/i,
  );
  assert.match(
    migration,
    /Existing committed signed transactions remain recoverable/,
  );
});

test('guard function does not expose a callable privileged API', () => {
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(
    migration,
    /revoke all on function public\.guard_reward_x_promotion_signed_commit_runtime_v1\(\)[\s\S]*from public,anon,authenticated,service_role/,
  );
});
