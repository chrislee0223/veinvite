import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inviteRoute = await readFile(
  new URL('../src/app/api/invites/route.ts', import.meta.url),
  'utf8',
);
const policyHelper = await readFile(
  new URL('../src/lib/rewards/rewardXPromotionPolicy.ts', import.meta.url),
  'utf8',
);
const sharedTypes = await readFile(
  new URL('../src/lib/types.ts', import.meta.url),
  'utf8',
);

test('invite API retains gross, claim, promotion and per-invite policy separately', () => {
  assert.match(inviteRoute, /rewardReservedAmountWei: reservedAmountWei/);
  assert.match(inviteRoute, /rewardClaimAmountWei: claimAmountWei/);
  assert.match(inviteRoute, /rewardPromotionAmountWei: promotionAmountWei/);
  assert.match(
    inviteRoute,
    /from\('reward_x_promotion_splits'\)[\s\S]*\.eq\('mode', 'LIVE'\)/,
  );
  assert.match(inviteRoute, /policy_version/);
  assert.match(inviteRoute, /validateDisplayXPromotionSplit/);
  assert.match(policyHelper, /x-promotion-additive-v2/);
  assert.match(policyHelper, /x-promotion-withheld-10pct-v3/);
});

test('legacy and unsplit rows still resolve the core claim to the fixed reservation when enrichment succeeds', () => {
  assert.match(
    inviteRoute,
    /promotionLookupAvailable[\s\S]*\? reservedAmountWei[\s\S]*: null/,
  );
  assert.match(inviteRoute, /if \(promotionSplit\?\.mode === 'LIVE'\)/);
});

test('both persisted X policies are validated with BigInt before displaying claim amounts', () => {
  assert.match(inviteRoute, /validateDisplayXPromotionSplit/);
  assert.match(policyHelper, /base === gross && promotion === X_PROMOTION_FIXED_BONUS_WEI/);
  assert.match(policyHelper, /base \+ promotion === gross && promotion === gross \/ 10n/);
  assert.match(policyHelper, /return null;/);
});

test('unknown or malformed LIVE split semantics fail closed instead of altering the core display', () => {
  assert.match(inviteRoute, /splitReservationWei !== reservedAmountWei/);
  assert.match(inviteRoute, /Invalid LIVE X promotion split/);
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
  assert.match(inviteRoute, /promotionLookupAvailable,[\s\S]*\);/);
});

test('shared client type keeps reservation, core claim and optional promotion fields separate', () => {
  assert.match(sharedTypes, /rewardReservedAmountWei\?: string/);
  assert.match(sharedTypes, /rewardClaimAmountWei\?: string/);
  assert.match(sharedTypes, /rewardPromotionAmountWei\?: string/);
  assert.match(sharedTypes, /rewardPromotionType\?: 'ADDITIVE' \| 'WITHHELD'/);
});

test('user-contract display code cannot enable X promotion or payouts', () => {
  assert.doesNotMatch(inviteRoute, /reward_x_promotion_enabled\s*=\s*true/);
  assert.doesNotMatch(inviteRoute, /reward_x_promotion_payout_enabled\s*=\s*true/);
});
