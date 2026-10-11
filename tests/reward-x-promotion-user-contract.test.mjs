import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inviteRoute = await readFile(
  new URL('../src/app/api/invites/route.ts', import.meta.url),
  'utf8',
);
const rewardActionRoute = await readFile(
  new URL(
    '../src/app/api/notifications/reward-actions/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const rewardActionType = await readFile(
  new URL('../src/lib/notifications/rewardAction.ts', import.meta.url),
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

test('legacy and shadow invite rows continue to claim the fixed reservation amount', () => {
  assert.match(
    inviteRoute,
    /let claimAmountWei = reservedAmountWei/,
  );
  assert.match(
    inviteRoute,
    /if \(promotionSplit\?\.mode === 'LIVE'\)/,
  );
});

test('LIVE invite split mismatches fail closed instead of falling back to the full reservation', () => {
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

test('reward action API exposes the same base/promotion contract without changing reservedAmountWei', () => {
  assert.match(
    rewardActionRoute,
    /reservedAmountWei: amount,[\s\S]*claimAmountWei,[\s\S]*promotionAmountWei/,
  );
  assert.match(
    rewardActionRoute,
    /from\('reward_x_promotion_splits'\)[\s\S]*\.eq\('mode', 'LIVE'\)/,
  );
  assert.match(
    rewardActionRoute,
    /LIVE X promotion split is invalid/,
  );
});

test('shared client types keep the old reservation field and add explicit split fields', () => {
  assert.match(sharedTypes, /rewardReservedAmountWei\?: string/);
  assert.match(sharedTypes, /rewardClaimAmountWei\?: string/);
  assert.match(sharedTypes, /rewardPromotionAmountWei\?: string/);
  assert.match(rewardActionType, /reservedAmountWei: string/);
  assert.match(rewardActionType, /claimAmountWei: string/);
  assert.match(
    rewardActionType,
    /promotionAmountWei: string \| null/,
  );
});

test('user-contract change cannot enable X promotion or payouts', () => {
  for (const source of [inviteRoute, rewardActionRoute]) {
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
