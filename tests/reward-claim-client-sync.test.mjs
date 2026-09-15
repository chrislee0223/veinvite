import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const clientSync = readFileSync(
  new URL('../src/lib/rewards/rewardClaimClient.ts', import.meta.url),
  'utf8',
);
const paidSync = readFileSync(
  new URL('../src/components/PaidActivationLiveSync.tsx', import.meta.url),
  'utf8',
);

test('ambiguous Claim responses reconcile against both durable actions and finalized receipts', () => {
  assert.match(
    clientSync,
    /fetch\('\/api\/notifications\/reward-actions'/u,
  );
  assert.match(
    clientSync,
    /fetch\('\/api\/rewards\/receipts\?limit=50'/u,
  );
  assert.match(
    clientSync,
    /receipt[\s\S]*state: 'PAID'/u,
  );
  assert.match(
    clientSync,
    /action\?\.status === 'QUEUED'[\s\S]*action\?\.status === 'ASSIGNED'[\s\S]*state: 'PROCESSING'/u,
  );
  assert.match(
    clientSync,
    /action\?\.status === 'AWAITING_CLAIM'[\s\S]*state: 'AWAITING_CLAIM'/u,
  );
  assert.match(
    clientSync,
    /state: 'UNKNOWN'/u,
  );
});

test('wallet-session expiry is handed back to the existing session gate', () => {
  assert.match(
    clientSync,
    /WALLET_SESSION_INVALID_EVENT =\s*'veinvite-wallet-session-invalid'/u,
  );
  assert.match(
    clientSync,
    /actionsResponse\?\.status === 401[\s\S]*receiptsResponse\?\.status === 401/u,
  );
  assert.match(
    clientSync,
    /new Event\(WALLET_SESSION_INVALID_EVENT\)/u,
  );
});

test('Claim sync carries the exact invite across same-tab and cross-tab listeners', () => {
  assert.match(
    clientSync,
    /new CustomEvent<RewardClaimSignal>[\s\S]*inviteCode/u,
  );
  assert.match(
    clientSync,
    /new BroadcastChannel\([\s\S]*REWARD_CLAIM_SYNC_CHANNEL/u,
  );
  assert.match(
    clientSync,
    /channel\.postMessage\(detail\)/u,
  );
  assert.match(
    clientSync,
    /export function subscribeRewardClaimUpdated/u,
  );
});

test('paid activation polling prioritizes the claimed invite before the generic receipt baseline', () => {
  const matchIndex = paidSync.indexOf('const matchedPendingReceipt');
  const baselineIndex = paidSync.indexOf('if (!initializedRef.current)');

  assert.ok(matchIndex >= 0, 'specific pending receipt match must exist');
  assert.ok(
    baselineIndex > matchIndex,
    'specific pending receipt must be checked before the generic baseline',
  );
  assert.match(
    paidSync,
    /pendingInviteCodesRef\.current\.has[\s\S]*receipt\.inviteCode/u,
  );
  assert.match(
    paidSync,
    /const CLAIM_POLL_TIMEOUT_MS = 180_000/u,
  );
  assert.match(
    paidSync,
    /subscribeRewardClaimUpdated/u,
  );
});
