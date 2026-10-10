import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const client = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionClient.ts',
    import.meta.url,
  ),
  'utf8',
);

const action = await readFile(
  new URL(
    '../src/components/RewardXPromotionReceiptAction.tsx',
    import.meta.url,
  ),
  'utf8',
);

const receipt = await readFile(
  new URL(
    '../src/components/RewardReceiptView.tsx',
    import.meta.url,
  ),
  'utf8',
);

test('promotion share URL preserves the existing production share page and adds only the opaque token', () => {
  assert.match(client, /hostname\.toLowerCase\(\) !== 'veinvite\.vercel\.app'/);
  assert.match(client, /url\.searchParams\.set\('xpromo', shareToken\.toLowerCase\(\)\)/);
  assert.match(client, /SHARE_TOKEN_PATTERN/);
});

test('promotion state and Post submission use the existing wallet-bound server APIs', () => {
  assert.match(client, /\/api\/rewards\/x-promotion\?inviteCode=/);
  assert.match(client, /'\/api\/rewards\/x-promotion\/submit'/);
  assert.match(client, /cache: 'no-store'/);
});

test('receipt action fails soft to ordinary X sharing when promotion state cannot load', () => {
  assert.match(action, /setLoadFailed\(true\)/);
  assert.match(action, /setPromotion\(null\)/);
  assert.match(action, /if \(!promotion\) \{[\s\S]*return ordinaryShare\(\)/);
});

test('promotion share never acknowledges or mutates the core reward receipt', () => {
  assert.doesNotMatch(action, /acknowledgeReward|ACKNOWLEDGE_REWARD_RECEIPT|\/seen/);
  assert.doesNotMatch(client, /ACKNOWLEDGE_REWARD_RECEIPT|\/seen/);
});

test('the Bell reward receipt delegates only its X action to promotion state', () => {
  assert.match(receipt, /<RewardXPromotionReceiptAction/);
  assert.match(receipt, /inviteCode=\{receipt\.inviteCode\}/);
  assert.match(receipt, /baseRewardAmountB3tr=\{receipt\.amountB3tr\}/);
  assert.match(receipt, /ordinaryShareIntentUrl=\{rewardShareIntentUrl\}/);
});

test('expired or released promotion never advertises a bonus', () => {
  assert.match(
    action,
    /promotion\.state === 'EXPIRED'[\s\S]*promotion\.state === 'RELEASED'[\s\S]*return ordinaryShare\(\)/,
  );
});

test('pending verification does not ask the user to resubmit the same Post', () => {
  assert.match(action, /promotion\.state === 'VERIFYING'/);
  assert.match(action, /copy\.verifying/);
  assert.match(action, /promotion\.state === 'REVIEW_REQUIRED'/);
  assert.match(action, /copy\.retrying/);
});
