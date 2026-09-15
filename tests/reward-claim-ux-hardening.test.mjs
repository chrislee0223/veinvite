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
const paidActivationSync = readFileSync(
  new URL('../src/components/PaidActivationLiveSync.tsx', import.meta.url),
  'utf8',
);
const progressCopy = readFileSync(
  new URL('../src/lib/i18n/progressClaimCopy.ts', import.meta.url),
  'utf8',
);

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

test('ambiguous Claim reconciliation is read-only, bounded, and requires finalized receipt evidence when the action disappears', () => {
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
    /\? \{ kind: 'ABSENT', receipt: paid \}\s*: \{ kind: 'UNKNOWN' \}/u,
  );
  assert.match(rewardClaimClient, /DEFAULT_RECONCILE_ATTEMPTS/u);
  assert.match(rewardClaimClient, /Math\.min\(5,/u);
  assert.doesNotMatch(rewardClaimClient, /\/api\/rewards\/claims/u);
  assert.doesNotMatch(rewardClaimClient, /method:\s*'POST'/u);
});

test('authoritative reward reads re-arm the existing wallet session flow on 401 or 403', () => {
  assert.match(
    rewardClaimClient,
    /WALLET_SESSION_INVALID_EVENT = 'veinvite-wallet-session-invalid'/u,
  );
  assert.match(
    rewardClaimClient,
    /response\.status === 401 \|\| response\.status === 403/u,
  );
  assert.match(
    rewardClaimClient,
    /notifyRewardClaimSessionInvalid\(\)/u,
  );
  assert.match(
    notificationCenter,
    /notifyRewardClaimSessionInvalid\(\)/u,
  );
});

test('Home Claim reconciles ambiguous responses and never auto-posts a second Claim', () => {
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

test('notification Claim survives panel close, sends exact invite identity, and never auto-posts a second Claim', () => {
  const closeResetStart = notificationCenter.indexOf("if (!open) {");
  const closeResetEnd = notificationCenter.indexOf('void loadRewardActions();', closeResetStart);
  assert.ok(closeResetStart >= 0 && closeResetEnd > closeResetStart);
  const closeResetBlock = notificationCenter.slice(closeResetStart, closeResetEnd);

  assert.doesNotMatch(closeResetBlock, /setClaimPendingCode\(null\)/u);
  assert.match(notificationCenter, /reconcileRewardClaimState\([\s\S]*action\.inviteCode/u);
  assert.match(
    notificationCenter,
    /dispatchRewardClaimUpdated\(action\.inviteCode\)/u,
  );
  assert.equal(
    occurrences(notificationCenter, "fetch('/api/rewards/claims'"),
    1,
    'Notification center must issue at most one Claim POST per user click',
  );
});

test('reward Claim signals synchronize tabs without mutating payout state', () => {
  assert.match(rewardClaimClient, /new BroadcastChannel\(REWARD_CLAIM_SYNC_CHANNEL\)/u);
  assert.match(rewardClaimClient, /channel\.postMessage\(detail\)/u);
  assert.match(rewardClaimClient, /listener\(signal, 'broadcast'\)/u);
  assert.match(paidActivationSync, /source === 'broadcast'/u);
  assert.match(paidActivationSync, /window\.location\.reload\(\)/u);
});

test('finalized receipt tracking can target the exact claimed invite before the initial baseline settles', () => {
  assert.match(paidActivationSync, /targetInviteCodeRef/u);
  assert.match(paidActivationSync, /sameInviteCode\(receipt\.inviteCode, targetInviteCode\)/u);
  assert.match(
    paidActivationSync,
    /if \(targetReceipt\)[\s\S]*requestPaidReload/u,
  );
  assert.match(
    paidActivationSync,
    /if \(!initializedRef\.current\)/u,
  );
  assert.ok(
    paidActivationSync.indexOf('if (targetReceipt)') <
      paidActivationSync.indexOf('if (!initializedRef.current)'),
    'targeted finalized receipt must be checked before baseline initialization',
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
