import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rewardClaimClient = readFileSync(
  new URL('../src/lib/rewards/rewardClaimClient.ts', import.meta.url),
  'utf8',
);
const homeClient = readFileSync(
  new URL('../src/components/HomeClient.tsx', import.meta.url),
  'utf8',
);
const notificationCenter = readFileSync(
  new URL('../src/components/UnifiedInviteNotificationHistoryCenter.tsx', import.meta.url),
  'utf8',
);
const notificationWrapper = readFileSync(
  new URL('../src/components/InviteNotificationHistoryCenter.tsx', import.meta.url),
  'utf8',
);
const progressCopy = readFileSync(
  new URL('../src/lib/i18n/progressClaimCopy.ts', import.meta.url),
  'utf8',
);

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

test('ambiguous Claim reconciliation is read-only and requires paid receipt evidence when the action disappears', () => {
  assert.match(
    rewardClaimClient,
    /fetch\('\/api\/notifications\/reward-actions',[\s\S]*cache: 'no-store'/u,
  );
  assert.match(
    rewardClaimClient,
    /fetch\('\/api\/rewards\/receipts\?limit=50',[\s\S]*cache: 'no-store'/u,
  );
  assert.match(
    rewardClaimClient,
    /return paid \? \{ kind: 'ABSENT' \} : \{ kind: 'UNKNOWN' \}/u,
  );
  assert.doesNotMatch(rewardClaimClient, /\/api\/rewards\/claims/u);
  assert.doesNotMatch(rewardClaimClient, /method:\s*'POST'/u);
});

test('Home Claim starts receipt tracking, reconciles ambiguous responses, and never auto-posts a second Claim', () => {
  assert.match(homeClient, /dispatchRewardClaimUpdated\(\)/u);
  assert.match(homeClient, /reconcileRewardClaimState\(invite\.code\)/u);
  assert.match(homeClient, /const requestWallet = wallet/u);
  assert.match(
    homeClient,
    /if \(!sameWallet\(activeWalletRef\.current, requestWallet\)\) return/u,
  );
  assert.match(
    homeClient,
    /activeWalletRef\.current = wallet;\s*setClaimPendingCode\(null\)/u,
  );
  assert.equal(
    occurrences(homeClient, "fetch('/api/rewards/claims'"),
    1,
    'Home must issue at most one Claim POST per user click',
  );
});

test('notification Claim survives panel close, reconciles ambiguous responses, and never auto-posts a second Claim', () => {
  const closeResetStart = notificationCenter.indexOf("if (!open) {");
  const closeResetEnd = notificationCenter.indexOf('void loadRewardActions();', closeResetStart);
  assert.ok(closeResetStart >= 0 && closeResetEnd > closeResetStart);
  const closeResetBlock = notificationCenter.slice(closeResetStart, closeResetEnd);

  assert.doesNotMatch(closeResetBlock, /setClaimPendingCode\(null\)/u);
  assert.match(notificationCenter, /reconcileRewardClaimState\([\s\S]*action\.inviteCode/u);
  assert.match(notificationCenter, /dispatchRewardClaimUpdated\(\)/u);
  assert.equal(
    occurrences(notificationCenter, "fetch('/api/rewards/claims'"),
    1,
    'Notification center must issue at most one Claim POST per user click',
  );
});

test('wallet identity remounts notification reward-action state', () => {
  assert.match(
    notificationWrapper,
    /key=\{wallet\?\.toLowerCase\(\) \?\? 'disconnected'\}/u,
  );
});

test('English and Korean queued Claim copy clearly describes processing rather than completion', () => {
  assert.match(progressCopy, /claimQueued: 'Payout processing'/u);
  assert.match(progressCopy, /claimQueued: '지급 처리 중'/u);
  assert.doesNotMatch(progressCopy, /claimQueued: '지급 요청 완료'/u);
});
