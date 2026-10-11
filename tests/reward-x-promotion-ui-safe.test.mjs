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

test('promotion share URL preserves the production share page and adds only the opaque token', () => {
  assert.match(client, /hostname\.toLowerCase\(\) !== 'veinvite\.vercel\.app'/);
  assert.match(client, /url\.searchParams\.set\('xpromo', shareToken\.toLowerCase\(\)\)/);
  assert.match(client, /SHARE_TOKEN_PATTERN/);
});

test('promotion state and Post submission use wallet-bound no-store server APIs', () => {
  assert.match(client, /\/api\/rewards\/x-promotion\?inviteCode=/);
  assert.match(client, /'\/api\/rewards\/x-promotion\/submit'/);
  assert.match(client, /cache: 'no-store'/);
});

test('feature loading and failures preserve the existing ordinary X share UX', () => {
  assert.match(
    action,
    /if \(snapshot === undefined\) \{[\s\S]*return ordinaryShare\(\)/,
  );
  assert.match(action, /if \(loadFailed\) \{[\s\S]*return ordinaryShare\(\)/);
  assert.doesNotMatch(
    action,
    /snapshot === undefined[\s\S]{0,320}promotionLoading/,
  );
});

test('promotion sharing can use the VeInvite fallback URL before referral-link warmup', () => {
  assert.match(action, /rewardShareUrl \|\| VEINVITE_SITE_URL/);
  assert.match(action, /promotionShareBaseUrl/);
  assert.doesNotMatch(
    action,
    /Boolean\(promotion\.shareToken\)[\s\S]{0,100}Boolean\(rewardShareUrl\)/,
  );
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

test('nonterminal states refresh without aggressive retention polling', () => {
  assert.match(action, /promotionState === 'VERIFYING'/);
  assert.match(action, /promotionState === 'REVIEW_REQUIRED'/);
  assert.match(action, /promotionState === 'PAYOUT_PENDING'/);
  assert.match(action, /promotionState === 'RETENTION'/);
  assert.match(action, /slowPoll \? 300_000 : 30_000/);
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
