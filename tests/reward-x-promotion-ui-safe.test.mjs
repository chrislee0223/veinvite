import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const client = await readFile(
  new URL('../src/lib/rewards/rewardXPromotionClient.ts', import.meta.url),
  'utf8',
);
const action = await readFile(
  new URL('../src/components/RewardXPromotionReceiptAction.tsx', import.meta.url),
  'utf8',
);
const receipt = await readFile(
  new URL('../src/components/RewardReceiptView.tsx', import.meta.url),
  'utf8',
);
const route = await readFile(
  new URL('../src/app/api/rewards/x-promotion/route.ts', import.meta.url),
  'utf8',
);
const paidPopup = await readFile(
  new URL('../src/hooks/useRewardPaidTransientFeedback.ts', import.meta.url),
  'utf8',
);
const openRoute = await readFile(
  new URL('../src/app/api/rewards/x-promotion/open/route.ts', import.meta.url),
  'utf8',
);

test('promotion share URL matches the production verifier contract', () => {
  assert.match(client, /hostname\.toLowerCase\(\) !== 'veinvite\.vercel\.app'/);
  assert.match(client, /REFERRAL_PATH_PATTERN/);
  assert.match(client, /url\.searchParams\.has\('xp'\)/);
  assert.match(client, /url\.searchParams\.set\('xp', shareToken\.toLowerCase\(\)\)/);
  assert.doesNotMatch(client, /searchParams\.set\('xpromo'/);
  assert.match(client, /SHARE_TOKEN_PATTERN/);
});

test('promotion state, immediate open, and Post submission use no-store server APIs', () => {
  assert.match(client, /\/api\/rewards\/x-promotion\?inviteCode=/);
  assert.match(client, /'\/api\/rewards\/x-promotion\/open'/);
  assert.match(client, /'\/api\/rewards\/x-promotion\/submit'/);
  assert.match(client, /cache: 'no-store'/);
  assert.match(openRoute, /requireWalletSession/);
  assert.match(openRoute, /sameOrigin/);
  assert.match(openRoute, /reward_x_promotion_enabled/);
});

test('loading preserves the ordinary share shape but blocks tokenless share races', () => {
  assert.match(
    action,
    /if \(snapshot === undefined\)[\s\S]*className="notificationXShare"[\s\S]*disabled[\s\S]*aria-busy="true"/,
  );
  assert.match(
    action,
    /rewardReceiptShareLabel\(locale\)/,
  );
  assert.match(
    action,
    /if \(loadFailed\) \{[\s\S]*return ordinaryShare\(\)/,
  );
});

test('promotion sharing waits for the canonical referral URL', () => {
  assert.match(
    action,
    /Boolean\(promotion\.shareToken\)[\s\S]{0,120}Boolean\(rewardShareUrl\)/,
  );
  assert.doesNotMatch(action, /VEINVITE_SITE_URL/);
});

test('only real promotion states replace ordinary sharing', () => {
  assert.match(action, /snapshot\.offerStatus === 'PREPARING'/);
  assert.match(action, /promotion\.state === 'RETENTION'/);
  assert.match(action, /promotion\.state === 'PAYOUT_PENDING'/);
  assert.match(action, /promotion\.state === 'PAID'/);
  assert.match(
    action,
    /promotion\.state === 'EXPIRED'[\s\S]*promotion\.state === 'RELEASED'[\s\S]*return ordinaryShare\(\)/,
  );
});

test('nonterminal states refresh at authoritative state boundaries', () => {
  assert.match(action, /promotionState === 'VERIFYING'/);
  assert.match(action, /promotionState === 'REVIEW_REQUIRED'/);
  assert.match(action, /promotionState === 'PAYOUT_PENDING'/);
  assert.match(action, /promotionState === 'OPEN'/);
  assert.match(action, /promotion\.postDeadlineAt/);
  assert.match(action, /promotionState === 'SUBMISSION_GRACE'/);
  assert.match(action, /promotion\.submissionGraceSeconds/);
  assert.match(action, /promotionState === 'RETENTION'/);
  assert.match(action, /promotion\.verifyAfter/);
  assert.match(action, /delayMs = 30_000/);
  assert.match(action, /: 60_000/);
});

test('Bell reward receipt delegates only the optional X action', () => {
  assert.match(receipt, /<RewardXPromotionReceiptAction/);
  assert.match(receipt, /inviteCode=\{receipt\.inviteCode\}/);
  assert.match(receipt, /baseRewardAmountB3tr=\{receipt\.amountB3tr\}/);
  assert.match(receipt, /ordinaryShareIntentUrl=\{rewardShareIntentUrl\}/);
});

test('promotion UI never mutates the core reward receipt read state', () => {
  assert.doesNotMatch(action, /ACKNOWLEDGE_REWARD_RECEIPT|\/seen|acknowledgeReward/);
  assert.doesNotMatch(client, /ACKNOWLEDGE_REWARD_RECEIPT|\/seen/);
});

test('missing opportunity distinguishes disabled or legacy receipts from materialization lag', () => {
  assert.match(route, /type PromotionOfferStatus/);
  for (const status of ['DISABLED','NOT_ELIGIBLE','PREPARING','AVAILABLE','CLOSED']) {
    assert.match(route, new RegExp(`'${status}'`));
  }
  assert.match(route, /reward_x_promotion_splits/);
  assert.match(route, /reward_x_promotion_obligations/);
  assert.match(route, /pendingPromotionAmountB3tr/);
});

test('all supported locales have dedicated X promotion copy', async () => {
  const localesSource = await readFile(
    new URL('../src/lib/i18n/locales.ts', import.meta.url),
    'utf8',
  );
  const copySource = await readFile(
    new URL('../src/lib/i18n/rewardXPromotionCopy.ts', import.meta.url),
    'utf8',
  );

  const locales = [
    ...localesSource.matchAll(/\{ locale: '([^']+)'/gmu),
  ].map((match) => match[1]).sort();
  const copyKeys = [
    ...copySource.matchAll(/^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu),
  ]
    .map((match) => match[1] ?? match[2])
    .filter(Boolean)
    .sort();

  assert.deepEqual(copyKeys, locales);
  assert.match(action, /REWARD_X_PROMOTION_COPY\[locale\]/);
});


test('paid reward popup renders the core payout before optional promotion resolution', () => {
  const renderIndex = paidPopup.indexOf('setFeedback({');
  const promotionLoadIndex = paidPopup.indexOf('await loadRewardXPromotion');
  assert.ok(renderIndex >= 0);
  assert.ok(promotionLoadIndex >= 0);
  assert.ok(
    renderIndex < promotionLoadIndex,
    'core payout popup must render before optional promotion lookup',
  );
  assert.match(paidPopup, /openRewardXPromotionOpportunity/);
  assert.match(paidPopup, /snapshot\.offerStatus ===[\s\S]*'PREPARING'/);
});

test('paid popup sharing is decoupled from reward receipt acknowledgement', () => {
  const shareBlock =
    /onShare:\s*\(\) => \{([\s\S]*?)\n\s*\},/u.exec(paidPopup);
  assert.ok(shareBlock);
  assert.match(shareBlock[1], /window\.open/);
  assert.doesNotMatch(
    shareBlock[1],
    /acknowledgeReward|ACKNOWLEDGE_REWARD_RECEIPT|\/seen/u,
  );
  assert.match(
    paidPopup,
    /onConfirm:[\s\S]*acknowledgeReward/,
  );
});

test('promotion-aware popup fails closed on unresolved bonus states', () => {
  assert.match(
    paidPopup,
    /PREPARING, grace, verification, retention and payout-pending/,
  );
  assert.match(
    paidPopup,
    /Optional share enhancement fails closed/,
  );
});
