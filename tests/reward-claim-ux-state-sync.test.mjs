import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const helper = read('src/lib/rewards/rewardClaimClient.ts');
const home = read('src/components/HomeClient.tsx');
const center = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');

test('ambiguous reward claims reconcile against authoritative queue state before receipts', () => {
  assert.match(helper, /fetch\('\/api\/notifications\/reward-actions'/);
  assert.match(helper, /action\?\.status === 'AWAITING_CLAIM'/);
  assert.match(helper, /action\?\.status === 'QUEUED'/);
  assert.match(helper, /action\?\.status === 'ASSIGNED'/);
  assert.match(helper, /fetch\('\/api\/rewards\/receipts\?limit=50'/);
  assert.match(helper, /candidate\.inviteCode === inviteCode/);
  assert.match(helper, /kind: 'PAID'/);
});

test('ambiguous reward claims stay protected during bounded state rechecks', () => {
  assert.match(
    helper,
    /AMBIGUOUS_CLAIM_RECHECK_DELAYS_MS = \[0, 700, 1_800\]/,
  );
  assert.match(helper, /reconcileAmbiguousRewardClaim/);
  assert.match(helper, /state\.kind === 'PROCESSING'/);
  assert.match(helper, /state\.kind === 'PAID'/);
});

test('home and notification Claim flows use the shared reconciliation and fast receipt trigger', () => {
  for (const source of [home, center]) {
    assert.match(source, /reconcileAmbiguousRewardClaim/);
    assert.match(source, /dispatchRewardClaimUpdated/);
    assert.match(source, /state\.kind === 'PROCESSING'/);
    assert.match(source, /state\.kind === 'PAID'/);
  }
});

test('the reconciliation path never submits a second Claim request', () => {
  const matches = helper.match(/\/api\/rewards\/claims/g) ?? [];
  assert.equal(matches.length, 0);
});
