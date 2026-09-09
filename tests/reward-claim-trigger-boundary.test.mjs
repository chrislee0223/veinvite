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
  const payoutIndex = claimRoute.indexOf('await runClaimPayoutKickoff()');

  assert.ok(rpcIndex >= 0, 'claim route must call request_reward_claim');
  assert.ok(payoutIndex > rpcIndex, 'payout worker must start only after Claim is recorded');
  assert.match(claimRoute, /Immediate reward payout iteration failed after claim:/u);
});

test('claim payout kickoff retries transient lock or queued idle states immediately', () => {
  assert.match(
    claimRoute,
    /const CLAIM_PAYOUT_RETRY_DELAYS_MS = \[/u,
  );
  assert.match(
    claimRoute,
    /result\.status === 'LOCKED'/u,
  );
  assert.match(
    claimRoute,
    /result\.status === 'IDLE'/u,
  );
  assert.match(
    claimRoute,
    /hasQueuedRemainder\(result\)/u,
  );
  assert.match(
    claimRoute,
    /for \(const delayMs of CLAIM_PAYOUT_RETRY_DELAYS_MS\)/u,
  );
  assert.match(
    claimRoute,
    /Immediate reward payout remained queued after Claim retries:/u,
  );
});

test('claim response schedules bounded continuation through finality and concurrent queued claims', () => {
  assert.match(claimRoute, /import \{[\s\S]*after,[\s\S]*\} from 'next\/server'/u);
  assert.match(
    claimRoute,
    /const CLAIM_PAYOUT_CONTINUATION_DELAYS_MS = \[/u,
  );
  assert.match(claimRoute, /result\.status === 'SUBMITTED'/u);
  assert.match(claimRoute, /result\.status === 'WAITING_FINALITY'/u);
  assert.match(claimRoute, /result\.status === 'PREPARED'/u);
  assert.match(
    claimRoute,
    /result\.status === 'PAID'[\s\S]*hasQueuedRemainder/u,
  );
  assert.match(
    claimRoute,
    /for \(const delayMs of CLAIM_PAYOUT_CONTINUATION_DELAYS_MS\)/u,
  );
  assert.match(
    claimRoute,
    /after\(async \(\) => \{[\s\S]*continueClaimPayoutAfterResponse/u,
  );
  assert.match(
    claimRoute,
    /Post-Claim reward payout continuation exhausted its bounded retries:/u,
  );
});

test('generic reward sweeps cannot transfer a newly eligible unclaimed reservation', () => {
  const standardStart = payoutWrapper.indexOf(
    'export async function runAutomaticRewardPayout',
  );

  assert.ok(standardStart >= 0, 'standard automatic payout wrapper must exist');

  const standardWorker = payoutWrapper.slice(standardStart);
  const reserveIndex = standardWorker.indexOf(
    'await reserveEligibleReferralRewards()',
  );
  const payoutIndex = standardWorker.indexOf(
    'return runBaseAutomaticRewardPayout()',
  );

  assert.ok(reserveIndex >= 0, 'generic sweep must reserve eligible rewards first');
  assert.ok(
    payoutIndex > reserveIndex,
    'generic sweep may reach the base payout worker only after the reservation sweep',
  );
  assert.match(
    standardWorker,
    /Only\s*\n?\s*\/\/ entries later moved to QUEUED by an explicit claim can reach the base payout/u,
  );
  assert.match(
    standardWorker,
    /completing a mission never causes an automatic token transfer/u,
  );
});