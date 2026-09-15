import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const helper = await readFile(
  new URL('../src/lib/rewards/rewardClaimLiveState.ts', import.meta.url),
  'utf8',
);
const home = await readFile(
  new URL('../src/components/HomeClient.tsx', import.meta.url),
  'utf8',
);
const center = await readFile(
  new URL('../src/components/UnifiedInviteNotificationHistoryCenter.tsx', import.meta.url),
  'utf8',
);
const facade = await readFile(
  new URL('../src/components/InviteNotificationHistoryCenter.tsx', import.meta.url),
  'utf8',
);
const copy = await readFile(
  new URL('../src/lib/i18n/progressClaimCopy.ts', import.meta.url),
  'utf8',
);

test('uncertain Claim responses reconcile by reads only', () => {
  assert.match(helper, /\/api\/notifications\/reward-actions/);
  assert.match(helper, /\/api\/rewards\/receipts\?limit=50/);
  assert.doesNotMatch(helper, /\/api\/rewards\/claims/);
  assert.match(helper, /kind: 'processing'/);
  assert.match(helper, /kind: 'paid'/);
  assert.match(helper, /kind: 'awaiting'/);
});

test('Home Claim starts live receipt tracking and guards stale attempts', () => {
  assert.match(home, /readRewardClaimLiveState/);
  assert.match(home, /notifyRewardClaimUpdated/);
  assert.match(home, /claimAttemptRef/);
  assert.match(home, /sameWallet\(activeWalletRef\.current, requestWallet\)/);
});

test('notification Claim reconciles uncertainty and invalidates stale attempts', () => {
  assert.match(center, /readRewardClaimLiveState/);
  assert.match(center, /notifyRewardClaimUpdated/);
  assert.match(center, /claimRequestRef/);
  assert.match(center, /actionRequestRef\.current \+= 1/);
});

test('wallet switch remounts reward notification action state', () => {
  assert.match(
    facade,
    /<UnifiedInviteNotificationHistoryCenter[\s\S]*key=\{wallet \?\? 'disconnected'\}/,
  );
});

test('processing copy avoids implying that payout already completed', () => {
  assert.match(copy, /claimQueued: '지급 처리 중'/);
  assert.match(copy, /claimQueued: 'Payout processing'/);
  assert.doesNotMatch(copy, /claimQueued: '지급 요청 완료'/);
});
