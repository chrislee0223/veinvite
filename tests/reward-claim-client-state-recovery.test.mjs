import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const autoRefresh = read('src/components/InviteStatusAutoRefresh.tsx');
const paidSync = read('src/components/PaidActivationLiveSync.tsx');
const claimRoute = read('src/app/api/rewards/claims/route.ts');

test('claim start wakes finalized-receipt tracking without mutating payout state', () => {
  assert.match(autoRefresh, /PRODUCT_ANALYTICS_EVENT/);
  assert.match(autoRefresh, /detail\.eventName === 'reward_claim_started'/);
  assert.match(autoRefresh, /new Event\(REWARD_CLAIM_UPDATED_EVENT\)/);
  assert.match(paidSync, /REWARD_CLAIM_UPDATED_EVENT/);
  assert.match(paidSync, /RECEIPT_FAST_POLL_MS = 2_000/);

  assert.doesNotMatch(autoRefresh, /request_reward_claim/);
  assert.doesNotMatch(autoRefresh, /runImmediateClaimRewardPayout/);
  assert.doesNotMatch(autoRefresh, /\/api\/rewards\/claims/);
});

test('ambiguous client failures re-read authoritative invite state on a bounded schedule', () => {
  assert.match(
    autoRefresh,
    /CLAIM_RECHECK_DELAYS_MS = \[250, 1_500, 4_000\] as const/,
  );
  assert.match(autoRefresh, /detail\.failureCode === 'network'/);
  assert.match(autoRefresh, /detail\.failureCode === 'malformed_response'/);
  assert.match(autoRefresh, /const data = await loadInvites\(\)/);
  assert.match(autoRefresh, /fingerprint !== baseline \|\| processing/);
  assert.match(autoRefresh, /window\.location\.reload\(\)/);
});

test('processing detection covers both queued and assigned rewards', () => {
  assert.match(
    autoRefresh,
    /invite\.rewardQueueStatus === 'QUEUED'[\s\S]*invite\.rewardQueueStatus === 'ASSIGNED'/,
  );
});

test('server remains the only authority that advances a Claim and starts payout', () => {
  assert.match(claimRoute, /request_reward_claim/);
  assert.match(claimRoute, /runImmediateClaimRewardPayout/);
  assert.match(claimRoute, /enqueueClaimPayoutContinuation/);
});
