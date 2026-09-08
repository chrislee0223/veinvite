import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const claimRoute = readFileSync(
  new URL('../src/app/api/rewards/claims/route.ts', import.meta.url),
  'utf8',
);
const payoutWrapper = readFileSync(
  new URL('../src/lib/rewards/automaticRewardPayoutWithMnemonic.ts', import.meta.url),
  'utf8',
);
const boundaryMigration = readFileSync(
  new URL('../supabase/migrations/20260908021554_assert_explicit_claim_reward_boundary.sql', import.meta.url),
  'utf8',
);

test('eligibility reserves before claim without manufacturing claim evidence', () => {
  assert.match(boundaryMigration, /reservation must enter AWAITING_CLAIM/u);
  assert.match(boundaryMigration, /reservation must not forge Claim evidence/u);
  assert.match(boundaryMigration, /position\('claim_requested_at' in v_commit\) > 0/u);
  assert.match(boundaryMigration, /position\('claim_requested_by_wallet' in v_commit\) > 0/u);
});

test('explicit claim is the authorization boundary for entering the payout queue', () => {
  assert.match(boundaryMigration, /Claim must authorize QUEUED state/u);
  assert.match(boundaryMigration, /status=''QUEUED''/u);
  assert.match(boundaryMigration, /claim_requested_at=now\(\)/u);
  assert.match(boundaryMigration, /claim_requested_by_wallet=v_wallet/u);
});

test('claim request queues first and immediately starts the payout worker', () => {
  const rpcIndex = claimRoute.indexOf("'request_reward_claim'");
  const payoutIndex = claimRoute.indexOf('await runAutomaticRewardPayout()');

  assert.ok(rpcIndex >= 0, 'claim route must call request_reward_claim');
  assert.ok(payoutIndex > rpcIndex, 'payout worker must start only after Claim is recorded');
  assert.match(claimRoute, /Immediate reward payout iteration failed after claim:/u);
});

test('generic reward sweeps cannot transfer a newly eligible unclaimed reservation', () => {
  const reserveIndex = payoutWrapper.indexOf('await reserveEligibleReferralRewards()');
  const payoutIndex = payoutWrapper.indexOf('return runBaseAutomaticRewardPayout()');

  assert.ok(reserveIndex >= 0);
  assert.ok(payoutIndex > reserveIndex);
  assert.match(
    payoutWrapper,
    /Only\s*\n?\s*\/\/ entries later moved to QUEUED by an explicit claim can reach the base payout/u,
  );
  assert.match(
    payoutWrapper,
    /completing a mission never causes an automatic token transfer/u,
  );
});
