import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('restriction screen exposes only already-approved reward Claim actions', async () => {
  const gate = await readFile(
    'src/components/WalletSessionGate.tsx',
    'utf8',
  );
  const panel = await readFile(
    'src/components/RestrictedApprovedRewardClaims.tsx',
    'utf8',
  );

  assert.match(
    gate,
    /permanent \? \(\s*<RestrictedApprovedRewardClaims/u,
  );
  assert.match(
    panel,
    /\/api\/notifications\/reward-actions/u,
  );
  assert.match(
    panel,
    /action\.status !== 'AWAITING_CLAIM'/u,
  );
  assert.match(
    panel,
    /fetch\('\/api\/rewards\/claims'/u,
  );
  assert.match(
    panel,
    /inviteCode: action\.inviteCode/u,
  );
});

test('restricted Claim panel does not reopen participation or create reward eligibility', async () => {
  const panel = await readFile(
    'src/components/RestrictedApprovedRewardClaims.tsx',
    'utf8',
  );

  assert.doesNotMatch(panel, /\/api\/invites(?:\/|')/u);
  assert.doesNotMatch(panel, /reward-reservation/u);
  assert.doesNotMatch(panel, /eligibility/u);
  assert.doesNotMatch(panel, /sybil_v2_reward_clearances/u);
  assert.doesNotMatch(panel, /wallet_restrictions/u);
});

test('immutable Claim boundary still authorizes existing v2-cleared reservations', async () => {
  const migration = await readFile(
    'supabase/migrations/20260923060200_harden_sybil_v2_claim_boundary.sql',
    'utf8',
  );

  const claimStart = migration.indexOf(
    'create or replace function public.request_reward_claim',
  );
  const claimEnd = migration.indexOf(
    'create or replace function public.enforce_reward_queue_identity_gate',
    claimStart,
  );

  assert.ok(claimStart >= 0 && claimEnd > claimStart);
  const claimSql = migration.slice(claimStart, claimEnd);

  assert.match(
    claimSql,
    /v_queue\.sybil_clearance_id is not null/u,
  );
  assert.match(
    claimSql,
    /v_queue\.status = 'AWAITING_CLAIM'/u,
  );
  assert.match(
    claimSql,
    /status = 'QUEUED'/u,
  );
  assert.doesNotMatch(
    claimSql,
    /sybil_v2_wallet_restrictions/u,
  );
});
