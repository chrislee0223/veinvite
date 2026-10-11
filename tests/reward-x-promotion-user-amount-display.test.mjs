import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const actionType = await readFile(
  new URL('../src/lib/notifications/rewardAction.ts', import.meta.url),
  'utf8',
);
const actionRoute = await readFile(
  new URL('../src/app/api/notifications/reward-actions/route.ts', import.meta.url),
  'utf8',
);
const home = await readFile(
  new URL('../src/components/HomeClient.tsx', import.meta.url),
  'utf8',
);
const restricted = await readFile(
  new URL('../src/components/RestrictedApprovedRewardClaims.tsx', import.meta.url),
  'utf8',
);
const homeHelpers = await readFile(
  new URL('../src/lib/homeClientHelpers.ts', import.meta.url),
  'utf8',
);

test('reward actions preserve total reservation and expose optional LIVE split amounts', () => {
  assert.match(actionType, /reservedAmountWei: string/);
  assert.match(actionType, /claimAmountWei\?: string/);
  assert.match(actionType, /promotionAmountWei\?: string/);

  assert.match(
    actionRoute,
    /from\('reward_x_promotion_splits'\)[\s\S]*\.eq\('mode', 'LIVE'\)/,
  );
  assert.match(
    actionRoute,
    /splitReservationWei === amount[\s\S]*BigInt\(baseAmountWei\)[\s\S]*BigInt\(splitPromotionWei\)[\s\S]*BigInt\(amount\)/,
  );
  assert.match(
    actionRoute,
    /reservedAmountWei: amount,[\s\S]*claimAmountWei[\s\S]*promotionAmountWei/,
  );
});

test('optional X promotion enrichment cannot remove the core reward action list', () => {
  assert.match(
    actionRoute,
    /promotionLookupAvailable[\s\S]*promotionResult\.error === null/,
  );
  assert.match(
    actionRoute,
    /Notification reward X promotion display enrichment unavailable/,
  );
  assert.doesNotMatch(
    actionRoute,
    /if \(promotionResult\.error\)[\s\S]{0,400}status: 500/,
  );
});

test('home displays the actual claim amount while keeping promotion separate', () => {
  assert.match(
    home,
    /invite\.rewardClaimAmountWei \?\?[\s\S]*invite\.rewardReservedAmountWei/,
  );
  assert.match(
    home,
    /rewardPromotionAmountWei[\s\S]*X \+\{promotionAmount\} B3TR/,
  );
  assert.match(
    home,
    /formatPositiveB3trWei\([\s\S]*invite\.rewardPromotionAmountWei/,
  );
  assert.match(
    homeHelpers,
    /formatPositiveB3trWei[\s\S]*\^\\d\+\$\/[\s\S]*BigInt\(value\) > 0n/,
  );
});

test('restricted reward claims also display base and promotion separately', () => {
  assert.match(
    restricted,
    /action\.claimAmountWei \?\?[\s\S]*action\.reservedAmountWei/,
  );
  assert.match(
    restricted,
    /action\.promotionAmountWei[\s\S]*X \+\{promotionAmount\} B3TR/,
  );
});

test('display-only wiring cannot enable X promotion or payouts', () => {
  for (const source of [actionRoute, home, restricted]) {
    assert.doesNotMatch(
      source,
      /reward_x_promotion_enabled\s*=\s*true/,
    );
    assert.doesNotMatch(
      source,
      /reward_x_promotion_payout_enabled\s*=\s*true/,
    );
  }
});
