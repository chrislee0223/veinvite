import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [hook, state, panel, home, status, earlyCopy, queue, submit, followup] = await Promise.all([
  read('src/hooks/useRewardPaidTransientFeedback.ts'),
  read('src/lib/rewards/earlyRewardTransferFeedback.ts'),
  read('src/components/RewardXPromotionPanel.tsx'),
  read('src/components/HomeClient.tsx'),
  read('src/components/RewardTransferConfirmationLabel.tsx'),
  read('src/lib/i18n/earlyRewardTransferCopy.ts'),
  read('src/app/api/notifications/reward-actions/route.ts'),
  read('src/app/api/rewards/x-promotion/submit/route.ts'),
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

test('X posting and post URL submission are available from the claimed state, before finality', () => {
  assert.match(home, /<TransferStatus inviteCode=\{invite\.code\}/u);
  assert.match(status, /<RewardXPromotionPanel[\s\S]*bonusOnly/u);
  assert.match(panel, /'OPEN', 'SUBMISSION_GRACE'/u);
  assert.match(panel, /\/api\/rewards\/x-promotion\/submit/u);
  assert.match(submit, /record_reward_x_promotion_post_submission_v1/u);
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


test('all 29 X follow-up copies point to the Home bonus panel without waiting for finality', async () => {
  const copies = await Promise.all([
    read('src/lib/i18n/rewardXPromotionCopy.ts'),
    read('src/lib/i18n/rewardXPromotionExpandedCopyA.ts'),
    read('src/lib/i18n/rewardXPromotionExpandedCopyB.ts'),
  ]);
  const all = copies.join('\n');
  assert.equal([...all.matchAll(/^\s*shareFollowupBody: ["']/gmu)].length, 29);
  assert.match(all, /VeInvite 홈의 X 추가 보상 카드/u);
  assert.match(all, /No need to wait for final settlement/u);
  assert.doesNotMatch(all, /Open your reward in Notifications|알림의 지급 완료 내역을 열고/u);
});


test('X offer stays visible through verification, and returning from X refreshes status', () => {
  assert.match(panel, /document\.addEventListener\('visibilitychange', refreshOnFocus\)/u);
  assert.match(panel, /window\.addEventListener\('focus', refreshOnFocus\)/u);
  assert.match(panel, /now - lastFocusRefreshAtRef\.current < 15_000/u);
  assert.match(panel, /bonusOnly &&[\s\S]*state\?\.promotionPending !== true/u);
  assert.match(panel, /'VERIFYING', 'RETENTION',[\s\S]*'REVIEW_REQUIRED', 'PAYOUT_PENDING'/u);
});
