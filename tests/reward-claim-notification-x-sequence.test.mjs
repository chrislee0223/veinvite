import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [hook, state, panel, home, status, earlyCopy, queue, followup] = await Promise.all([
  read('src/hooks/useRewardPaidTransientFeedback.ts'),
  read('src/lib/rewards/earlyRewardTransferFeedback.ts'),
  read('src/components/RewardXPromotionPanel.tsx'),
  read('src/components/HomeClient.tsx'),
  read('src/components/RewardTransferConfirmationLabel.tsx'),
  read('src/lib/i18n/earlyRewardTransferCopy.ts'),
  read('src/app/api/notifications/reward-actions/route.ts'),
  read('src/components/RewardPaidXFollowups.tsx'),
]);

test('canonical transfer uses immutable proof and is not misreported as finalized PAID', () => {
  assert.match(queue, /broadcastConfirmedAt &&[\s\S]*submission\?\.tx_id/u);
  assert.match(status, /TX_ID_PATTERN\.test\(action\.txId\)/u);
  assert.match(status, /copy\.transferConfirmed/u);
  assert.doesNotMatch(status, /finalize_reward_payout_manifest|sendTransaction|reward_receipts/u);
});

test('the early X share and X connection both acknowledge the exact canonical popup', () => {
  assert.match(hook, /setEarlyTransfer\(\{ inviteCode: code, txId: tx, feedbackId:/u);
  const earlyShare = hook.slice(hook.indexOf('Optional early X action'));
  assert.match(earlyShare, /markEarlyRewardTransferAcknowledged\(\s*wallet, earlyTransfer\.inviteCode, earlyTransfer\.txId/u);
  assert.match(earlyShare, /window\.open\(intentUrl/u);
  assert.match(earlyShare, /x-connect\/start\?inviteCode/u);
  assert.match(hook, /wasEarlyRewardTransferAcknowledged\([\s\S]*pendingReward\.txId/u);
  assert.match(hook, /void acknowledgeReward\(pendingReward\)/u);
  assert.match(state, /const ACK_PREFIX = 'veinvite:early-transfer-acknowledged:v1:'/u);
});

test('X linked account and auto sharing are available before finality', () => {
  assert.match(home, /<TransferStatus inviteCode=\{invite\.code\}/u);
  assert.match(status, /<RewardXPromotionPanel[\s\S]*bonusOnly/u);
  assert.match(panel, /'OPEN', 'SUBMISSION_GRACE'/u);
  assert.match(panel, /x-connect\/start/u);
  assert.doesNotMatch(panel, /x-promotion\/submit|postUrl/u);
});

test('bonus remains available on Home after PAID and only while server offer is open', () => {
  assert.match(home, /RewardPaidXFollowups/u);
  assert.match(followup, /recentPaidXBonuses/u);
  assert.match(followup, /rewardEligibility !== 'PAID'/u);
  assert.match(followup, /paid-x-offer:/u);
  assert.match(panel, /bonusOnly &&[\s\S]*'VERIFYING', 'RETENTION'/u);
  assert.match(panel, /Date\.now\(\) >= Date\.parse\(promotion\.postDeadlineAt\)/u);
});

test('confirmed popup is not held hostage by optional referral-link readiness', () => {
  assert.doesNotMatch(hook, /if \(!shareReady && !shareUnavailable\) return;/u);
  assert.match(hook, /if \(!shareReady \|\| !referralLink\)/u);
});

test('all localized early notices describe an immediate conditional X bonus, not a finality-gated offer', () => {
  const localeCount = [...earlyCopy.matchAll(/^\s*"[^"]+": \{ title:/gmu)].length;
  assert.equal(localeCount, 29);
  assert.match(earlyCopy, /X 추가 보상 기회가 열렸다면 지금 바로 참여할 수 있어요/u);
  assert.doesNotMatch(earlyCopy, /最終確認後に開放|最終確定後に開始|最终确认后开放|最終確認後に/u);
});


test('X follow-up copy is automatic-only in all 29 locales', async () => {
  const copies = await Promise.all([
    read('src/lib/i18n/rewardXPromotionAutoCopyA.ts'),
    read('src/lib/i18n/rewardXPromotionAutoCopyB.ts'),
  ]);
  const all = copies.join('\n');
  assert.equal([...all.matchAll(/^\s*autoShareFollowupBody: ["']/gmu)].length, 29);
  assert.match(all, /X에 게시했다면 링크 제출이나 별도 확인은 필요 없어요/u);
  assert.doesNotMatch(all, /^\s*connectedX:/mu);
});


test('X offer stays visible through verification, and returning from X refreshes status', () => {
  assert.match(panel, /document\.addEventListener\('visibilitychange', refreshOnFocus\)/u);
  assert.match(panel, /window\.addEventListener\('focus', refreshOnFocus\)/u);
  assert.match(panel, /now - lastFocusRefreshAtRef\.current < 15_000/u);
  assert.match(panel, /bonusOnly &&[\s\S]*state\?\.promotionPending !== true/u);
  assert.match(panel, /'VERIFYING', 'RETENTION',[\s\S]*'REVIEW_REQUIRED', 'PAYOUT_PENDING'/u);
});
