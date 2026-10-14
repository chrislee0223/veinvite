import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const receiptView = await readFile(
  new URL('../src/components/RewardReceiptView.tsx', import.meta.url),
  'utf8',
);
const actions = await readFile(
  new URL(
    '../src/components/RewardReceiptXPromotionActions.tsx',
    import.meta.url,
  ),
  'utf8',
);

test('core reward receipt isolates X promotion behavior in a child component', () => {
  assert.match(
    receiptView,
    /<RewardReceiptXPromotionActions/,
  );
  assert.doesNotMatch(
    receiptView,
    /\/api\/rewards\/x-promotion/,
  );
  assert.doesNotMatch(
    receiptView,
    /reward_x_promotion_enabled|reward_x_promotion_payout_enabled/,
  );
});

test('reward receipt action loads the wallet-bound X promotion state', () => {
  assert.match(
    actions,
    /\/api\/rewards\/x-promotion\?inviteCode=/,
  );
  assert.match(actions, /cache: 'no-store'/);
  assert.match(
    actions,
    /notifyRewardClaimSessionInvalid/,
  );
});

test('OPEN promotion share uses the server-issued xp token', () => {
  assert.match(
    actions,
    /url\.searchParams\.set\([\s\S]*'xp'/,
  );
  assert.match(
    actions,
    /promotion\?\.state === 'OPEN'/,
  );
  assert.match(
    actions,
    /promotionShareIntentUrl/,
  );
});

test('reward receipt submits only the user-entered X Post URL to the verification API', () => {
  assert.match(
    actions,
    /fetch\([\s\S]*'\/api\/rewards\/x-promotion\/submit'/,
  );
  assert.match(
    actions,
    /JSON\.stringify\(\{[\s\S]*inviteCode,[\s\S]*postUrl: postUrl\.trim\(\)/,
  );
});

test('promotion UI preserves all durable lifecycle states', () => {
  for (const state of [
    'OPEN',
    'SUBMISSION_GRACE',
    'VERIFYING',
    'RETENTION',
    'REVIEW_REQUIRED',
    'PAYOUT_PENDING',
    'PAID',
    'EXPIRED',
    'RELEASED',
  ]) {
    assert.match(
      actions,
      new RegExp(`'${state}'`),
    );
  }
});

test('promotion UI does not mutate payout or runtime authority', () => {
  assert.doesNotMatch(
    actions,
    /reward_x_promotion_enabled\s*=|reward_x_promotion_payout_enabled\s*=/,
  );
  assert.doesNotMatch(
    actions,
    /reward_queue_entries|reward_payouts|reward_receipts/,
  );
});

test('generic sharing stays fail-closed until promotion lookup succeeds', () => {
  assert.match(actions, /lookupSucceeded/);
  assert.match(
    actions,
    /lookupSucceeded &&[\s\S]*!promotion/,
  );
  assert.match(
    actions,
    /setLookupSucceeded\(true\)/,
  );
});

test('OPEN promotion never falls back to an untagged generic share link', () => {
  assert.match(
    actions,
    /promotion\.state === 'PAID'[\s\S]*promotion\.state === 'EXPIRED'[\s\S]*promotion\.state === 'RELEASED'/,
  );
  assert.match(
    actions,
    /shareUnavailable/,
  );
});

test('post URL input uses a per-instance id and session failures reuse wallet auth recovery', () => {
  assert.match(actions, /const inputId = useId\(\)/);
  assert.match(actions, /htmlFor=\{inputId\}/);
  assert.match(actions, /id=\{inputId\}/);
  assert.match(
    actions,
    /response\.status === 401[\s\S]*notifyRewardClaimSessionInvalid\(\)/,
  );
});


test('QA promotion preview bypasses live promotion network calls', () => {
  assert.match(
    actions,
    /if \(previewPromotion !== undefined\)[\s\S]*setPromotion\(previewPromotion\)[\s\S]*return;/,
  );
  assert.match(
    actions,
    /previewPromotion !== undefined \|\|[\s\S]*submitting/,
  );
});

test('production reward receipt accepts only an optional preview injection', () => {
  assert.match(
    receiptView,
    /previewPromotion\?: RewardXPromotionPreview \| null/,
  );
  assert.match(
    receiptView,
    /previewPromotion=\{previewPromotion\}/,
  );
});


test('promotion 403 responses do not invalidate a valid wallet session', () => {
  assert.doesNotMatch(
    actions,
    /response\.status === 401\s*\|\|\s*response\.status === 403/,
  );
});
