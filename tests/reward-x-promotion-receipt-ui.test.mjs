import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const receiptView = await readFile(
  new URL('../src/components/RewardReceiptView.tsx', import.meta.url),
  'utf8',
);
const panel = await readFile(
  new URL('../src/components/RewardXPromotionPanel.tsx', import.meta.url),
  'utf8',
);
const popupHook = await readFile(
  new URL('../src/hooks/useRewardPaidTransientFeedback.ts', import.meta.url),
  'utf8',
);
const promotionRoute = await readFile(
  new URL('../src/app/api/rewards/x-promotion/route.ts', import.meta.url),
  'utf8',
);
const share = await readFile(
  new URL('../src/lib/rewards/rewardReceiptShare.ts', import.meta.url),
  'utf8',
);

test('reward receipt delegates all X sharing decisions to the promotion panel', () => {
  assert.match(
    receiptView,
    /<RewardXPromotionPanel[\s\S]*inviteCode=\{receipt\.inviteCode\}[\s\S]*receiptAmountB3tr=\{receipt\.amountB3tr\}/,
  );
  assert.doesNotMatch(
    receiptView,
    /rewardReceiptXIntentUrl|rewardReceiptShareLabel/,
  );
});

test('promotion panel reads durable state and submits a public X Post URL', () => {
  assert.match(
    panel,
    /\/api\/rewards\/x-promotion\?inviteCode=/,
  );
  assert.match(
    panel,
    /fetch\([\s\S]*['"]\/api\/rewards\/x-promotion\/submit['"][\s\S]*method: 'POST'/,
  );
  assert.match(
    panel,
    /promotion\.state === 'OPEN'[\s\S]*promotion\.state === 'SUBMISSION_GRACE'/,
  );
});

test('legacy sharing is allowed only when this referral has no pending promotion authority', () => {
  assert.match(
    panel,
    /promotion \|\|[\s\S]*state\?\.promotionPending === true[\s\S]*return ''/,
  );
  assert.match(
    popupHook,
    /promotion === null &&[\s\S]*body\.promotionPending !== true/,
  );
  assert.doesNotMatch(
    popupHook,
    /body\.newOffersEnabled === false &&[\s\S]*promotion === null/,
  );
});

test('promotion pending status comes from the referral obligation rather than the global runtime switch', () => {
  assert.match(
    promotionRoute,
    /from\('reward_x_promotion_obligations'\)[\s\S]*\.eq\('invite_code', inviteCode\)[\s\S]*\.eq\('recipient_wallet', wallet\)/,
  );
  assert.match(
    promotionRoute,
    /financialState === 'RESERVED' \|\|[\s\S]*financialState === 'HELD'/,
  );
  assert.match(
    promotionRoute,
    /promotionPending,[\s\S]*promotion: null/,
  );
});

test('promotion share link carries one opaque xp token on the production referral URL', () => {
  assert.match(
    share,
    /X_PROMOTION_TOKEN_PATTERN/,
  );
  assert.match(
    share,
    /hostname\.toLowerCase\(\) !== 'veinvite\.vercel\.app'/,
  );
  assert.match(
    share,
    /\^\\\/s\\\/(?:\[A-Za-z0-9_-\]|[^\n])+\/u/,
  );
  assert.match(
    share,
    /url\.searchParams\.set\('xp', token\)/,
  );
});

test('core paid feedback is rendered before optional X enrichment', () => {
  const paidFeedbackIndex =
    popupHook.indexOf("kind: 'reward'");
  const xLookupIndex =
    popupHook.indexOf('/api/rewards/x-promotion?inviteCode=');

  assert.ok(paidFeedbackIndex >= 0);
  assert.ok(xLookupIndex > paidFeedbackIndex);
  assert.match(
    popupHook,
    /AbortSignal\.timeout\(4_000\)/,
  );
  assert.match(
    popupHook,
    /already-visible payout[\s\S]*promotion lookup is slow/,
  );
});

test('reward popup resolves promotion state before exposing X sharing and fails closed on errors', () => {
  assert.match(
    popupHook,
    /\/api\/rewards\/x-promotion\?inviteCode=/,
  );
  assert.match(
    popupHook,
    /promotion\?\.state === 'OPEN'/,
  );
  assert.match(
    popupHook,
    /rewardXPromotionShareUrl/,
  );
  assert.match(
    popupHook,
    /catch \{[\s\S]*Fail closed for optional sharing/,
  );
});

test('opening X no longer acknowledges the reward receipt', () => {
  const shareHandlerMatch =
    /onShare: \(\) => \{([\s\S]*?)\n\s*\},\n\s*\}/.exec(popupHook);

  assert.ok(shareHandlerMatch);
  assert.match(
    shareHandlerMatch[1],
    /window\.open/,
  );
  assert.doesNotMatch(
    shareHandlerMatch[1],
    /acknowledgeReward/,
  );
  assert.match(
    popupHook,
    /onConfirm: \(\) => \{[\s\S]*acknowledgeReward\(payload\)/,
  );
});
