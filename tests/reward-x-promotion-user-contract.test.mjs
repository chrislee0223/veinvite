import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inviteRoute = await readFile(
  new URL('../src/app/api/invites/route.ts', import.meta.url),
  'utf8',
);
const sharedTypes = await readFile(
  new URL('../src/lib/types.ts', import.meta.url),
  'utf8',
);

test('invite API preserves immutable reservation while exposing LIVE base and promotion amounts', () => {
  assert.match(
    inviteRoute,
    /rewardReservedAmountWei: reservedAmountWei/,
  );
  assert.match(
    inviteRoute,
    /rewardClaimAmountWei: claimAmountWei/,
  );
  assert.match(
    inviteRoute,
    /rewardPromotionAmountWei: promotionAmountWei/,
  );
  assert.match(
    inviteRoute,
    /from\('reward_x_promotion_splits'\)[\s\S]*\.eq\('mode', 'LIVE'\)/,
  );
});

test('legacy and shadow invite rows resolve claim amount to the fixed reservation when enrichment succeeds', () => {
  assert.match(
    inviteRoute,
    /promotionLookupAvailable[\s\S]*\? reservedAmountWei[\s\S]*: null/,
  );
  assert.match(
    inviteRoute,
    /if \(promotionSplit\?\.mode === 'LIVE'\)/,
  );
});

test('X promotion enrichment failure never blocks the core invites response', () => {
  assert.match(
    inviteRoute,
    /const promotionLookupAvailable =[\s\S]*promotionResult\.error === null/,
  );
  assert.match(
    inviteRoute,
    /Invitation X promotion display enrichment unavailable/,
  );
  assert.doesNotMatch(
    inviteRoute,
    /if \(promotionResult\.error\)[\s\S]{0,500}status: 500/,
  );
});

test('when enrichment is unavailable, explicit claim and promotion amounts are omitted instead of guessed', () => {
  assert.match(
    inviteRoute,
    /let claimAmountWei: string \| null =[\s\S]*promotionLookupAvailable[\s\S]*\? reservedAmountWei[\s\S]*: null/,
  );
  assert.match(
    inviteRoute,
    /promotionLookupAvailable,[\s\S]*\),/,
  );
});

test('LIVE split mismatches fail closed instead of falling back to the full reservation', () => {
  assert.match(
    inviteRoute,
    /splitReservationWei !== reservedAmountWei/,
  );
  assert.match(
    inviteRoute,
    /BigInt\(baseAmountWei\) \+ BigInt\(splitPromotionWei\)[\s\S]*BigInt\(reservedAmountWei\)/,
  );
  assert.match(
    inviteRoute,
    /Invalid LIVE X promotion split/,
  );
});

test('shared client type keeps the old reservation field and adds optional split fields', () => {
  assert.match(sharedTypes, /rewardReservedAmountWei\?: string/);
  assert.match(sharedTypes, /rewardClaimAmountWei\?: string/);
  assert.match(sharedTypes, /rewardPromotionAmountWei\?: string/);
});

test('user-contract change cannot enable X promotion or payouts', () => {
  assert.doesNotMatch(
    inviteRoute,
    /reward_x_promotion_enabled\s*=\s*true/,
  );
  assert.doesNotMatch(
    inviteRoute,
    /reward_x_promotion_payout_enabled\s*=\s*true/,
  );
});
