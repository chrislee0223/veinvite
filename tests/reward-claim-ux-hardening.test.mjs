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
const notificationController = readFileSync(
  new URL('../src/components/InAppInviteNotifications.tsx', import.meta.url),
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
    /`\/api\/rewards\/receipts\?inviteCode=\$\{encodeURIComponent\(inviteCode\)\}`,[\s\S]*cache: 'no-store'/u,
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
    /activeWalletRef\.current = wallet;[\s\S]{0,180}setClaimPendingCode\(null\)/u,
  );
  assert.equal(
    occurrences(homeClient, "fetch('/api/rewards/claims'"),
    1,
    'Home must issue at most one Claim POST per user click',
  );
});

test('notification history never owns or posts Claim actions', () => {
  assert.doesNotMatch(notificationCenter, /reconcileRewardClaimState/u);
  assert.doesNotMatch(notificationCenter, /dispatchRewardClaimUpdated/u);
  assert.doesNotMatch(notificationCenter, /notificationClaimButton/u);
  assert.equal(
    occurrences(notificationCenter, "fetch('/api/rewards/claims'"),
    0,
    'Claim POSTs must stay owned by Home only',
  );
});

test('reward Claim signals synchronize tabs without mutating payout state', () => {
  assert.match(rewardClaimClient, /new BroadcastChannel\(REWARD_CLAIM_SYNC_CHANNEL\)/u);
  assert.match(rewardClaimClient, /channel\.postMessage\(detail\)/u);
  assert.match(rewardClaimClient, /listener\(signal, 'broadcast'\)/u);
  assert.match(paidActivationSync, /source === 'broadcast'/u);
  assert.match(paidActivationSync, /window\.location\.reload\(\)/u);
});

test('generic Home Claim signals recover only authoritative processing invite identities read-only', () => {
  assert.match(homeClient, /dispatchRewardClaimUpdated\(\)/u);
  assert.match(
    paidActivationSync,
    /fetch\('\/api\/notifications\/reward-actions',[\s\S]*cache: 'no-store'/u,
  );
  assert.match(paidActivationSync, /readProcessingInviteCodes/u);
  assert.match(paidActivationSync, /action\.status !== 'AWAITING_CLAIM'/u);
  assert.match(
    paidActivationSync,
    /targetInviteCodesRef\.current\.add\(inviteCode\)/u,
  );
  assert.match(
    paidActivationSync,
    /notifyRewardClaimSessionInvalid\(\)/u,
  );
  assert.doesNotMatch(paidActivationSync, /method:\s*'POST'/u);
});

test('finalized receipt tracking can target claimed invites before the initial baseline settles', () => {
  assert.match(paidActivationSync, /targetInviteCodesRef/u);
  assert.match(
    paidActivationSync,
    /targetInviteCodes\.has\(receipt\.inviteCode\.trim\(\)\.toUpperCase\(\)\)/u,
  );
  assert.match(
    paidActivationSync,
    /if \(targetReceipts\.length > 0\)[\s\S]*requestPaidReload/u,
  );
  assert.match(
    paidActivationSync,
    /if \(!initializedRef\.current\)/u,
  );
  assert.ok(
    paidActivationSync.indexOf('if (targetReceipts.length > 0)') <
      paidActivationSync.indexOf('if (!initializedRef.current)'),
    'targeted finalized receipts must be checked before baseline initialization',
  );
});

test('wallet identity resets notification history without a reward-action sub-state', () => {
  assert.match(notificationWrapper, /UnifiedInviteNotificationHistoryCenter/u);
  assert.doesNotMatch(notificationWrapper, /RewardActionItem/u);
  assert.match(notificationController, /useEffect\(\(\) => \{[\s\S]*setItems\(cached\?\.items \?\? \[\]\)[\s\S]*\}, \[wallet\]\)/u);
});

test('English and Korean queued Claim copy clearly describes processing rather than completion', () => {
  assert.match(progressCopy, /claimQueued: 'Payout processing'/u);
  assert.match(progressCopy, /claimQueued: '지급 처리 중'/u);
  assert.doesNotMatch(progressCopy, /claimQueued: '지급 요청 완료'/u);
});
