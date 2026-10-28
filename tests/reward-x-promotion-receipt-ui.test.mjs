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
const locales = await readFile(
  new URL('../src/lib/i18n/locales.ts', import.meta.url),
  'utf8',
);
const promotionCopyBase = await readFile(
  new URL('../src/lib/i18n/rewardXPromotionCopy.ts', import.meta.url),
  'utf8',
);
const promotionCopyExpandedA = await readFile(
  new URL('../src/lib/i18n/rewardXPromotionExpandedCopyA.ts', import.meta.url),
  'utf8',
);
const promotionCopyExpandedB = await readFile(
  new URL('../src/lib/i18n/rewardXPromotionExpandedCopyB.ts', import.meta.url),
  'utf8',
);
const promotionCopy =
  promotionCopyBase + '\n' +
  promotionCopyExpandedA + '\n' +
  promotionCopyExpandedB;

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


test('X promotion copy explicitly covers every locale registered by VeInvite', () => {
  const localeMatches = Array.from(
    locales.matchAll(/\{ locale: '([^']+)'/g),
    (match) => match[1],
  );

  assert.ok(localeMatches.length > 0);

  for (const locale of localeMatches) {
    assert.match(
      promotionCopy,
      new RegExp("(?:^|\\n)\\s*['\"]?" + locale + "['\"]?\\s*:"),
      "Missing X promotion copy for " + locale,
    );
  }
});


test('an open receipt refreshes when the X offer deadline or submission grace ends', () => {
  assert.match(panel, /promotion\.state === 'OPEN'[\s\S]*?transitionAt/);
  assert.match(panel, /promotion\.submissionGraceSeconds \* 1000/);
  assert.match(panel, /window\.setTimeout\([\s\S]*?\(\) => void load\(\)/);
  assert.match(panel, /window\.clearTimeout\(timer\)/);
  assert.match(panel, /transitionAt - Date\.now\(\) \+ 1_000/);
  // Prevent a 24-hour interval poll from introducing unnecessary database load.
  assert.doesNotMatch(panel, /\['OPEN', 'SUBMISSION_GRACE'\]\.includes\(promotion\?\.state/);
});

test('reward popup fails closed after expiry even if its share action was already cached', () => {
  assert.match(popupHook, /postDeadlineAt\?: string/);
  assert.match(popupHook, /Date\.now\(\) < Date\.parse\(promotion\.postDeadlineAt\)/);
  assert.match(popupHook, /shareDeadlineMs !== null && Date\.now\(\) >= shareDeadlineMs/);
  assert.match(popupHook, /shareExpiryTimerRef/);
  assert.match(popupHook, /clearTimeout\(shareExpiryTimerRef\.current\)/);
  assert.match(popupHook, /setTimeout\(\(\) => \{/);
  assert.match(popupHook, /onShare: undefined/);
  assert.match(popupHook, /visible\?\.kind === 'reward' && visible\.id === feedbackId/);
});

test('receipt share also blocks an expired offer when a background tab delayed expiry timers', () => {
  assert.match(panel, /Date\.now\(\) >= Date\.parse\(promotion\.postDeadlineAt\)/);
  assert.match(panel, /if \(Date\.now\(\) >= Date\.parse\(promotion\.postDeadlineAt\)\) \{[\s\S]*?void load\(\);[\s\S]*?return/);
});

test('X promotion state lookup has a bounded timeout and a safe manual retry', () => {
  assert.match(
    panel,
    /cache: 'no-store',[\s\S]*?signal: AbortSignal\.timeout\(12_000\)/,
  );
  assert.match(
    panel,
    /if \(requestSequence !== requestSequenceRef\.current\) return;/,
  );
  assert.match(
    panel,
    /if \(loadError\) \{[\s\S]*?setLoading\(true\);[\s\S]*?void load\(\);/,
  );
  assert.match(panel, /if \(loading\) \{\s*return null;/);
});
