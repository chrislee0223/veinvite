import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const receipt = await readFile(
  new URL('../src/components/RewardReceiptView.tsx', import.meta.url),
  'utf8',
);

test('reward receipt loads the wallet-bound X promotion state', () => {
  assert.match(
    receipt,
    /\/api\/rewards\/x-promotion\?inviteCode=/,
  );
  assert.match(receipt, /cache: 'no-store'/);
});

test('OPEN promotion share uses the server-issued xp token', () => {
  assert.match(receipt, /url\.searchParams\.set\([\s\S]*'xp'/);
  assert.match(receipt, /promotion\?\.state === 'OPEN'/);
  assert.match(receipt, /promotionShareIntentUrl/);
});

test('reward receipt submits only the user-entered X Post URL to the verification API', () => {
  assert.match(
    receipt,
    /fetch\([\s\S]*'\/api\/rewards\/x-promotion\/submit'/,
  );
  assert.match(
    receipt,
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
    assert.match(receipt, new RegExp(`'${state}'`));
  }
});

test('promotion UI does not mutate payout or runtime authority', () => {
  assert.doesNotMatch(
    receipt,
    /reward_x_promotion_enabled\s*=|reward_x_promotion_payout_enabled\s*=/,
  );
  assert.doesNotMatch(
    receipt,
    /reward_queue_entries|reward_payouts|reward_receipts/,
  );
});

test('generic X sharing remains available when no active promotion exists', () => {
  assert.match(receipt, /showGenericShare/);
  assert.match(receipt, /rewardShareIntentUrl/);
});


test('generic sharing stays hidden until promotion lookup succeeds', () => {
  assert.match(receipt, /promotionLookupSucceeded/);
  assert.match(
    receipt,
    /\(promotionLookupSucceeded && !promotion\)/,
  );
  assert.match(
    receipt,
    /setPromotionLookupSucceeded\(true\)/,
  );
});
