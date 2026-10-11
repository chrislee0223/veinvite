import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(
  new URL('../src/components/HomeClient.tsx', import.meta.url),
  'utf8',
);

test('Home uses explicit claim amount instead of total reservation for immediate payout display', () => {
  assert.match(
    home,
    /const claimAmount = invite\.rewardClaimAmountWei[\s\S]*formatB3trWei\(invite\.rewardClaimAmountWei\)/,
  );
  assert.doesNotMatch(
    home,
    /const amount = formatB3trWei\([\s\S]{0,100}rewardReservedAmountWei/,
  );
});

test('optional X promotion amount is rendered separately from the fixed base reward', () => {
  assert.match(home, /rewardPromotionAmountWei/);
  assert.match(home, /rewardPromotionMeta/);
  assert.match(home, /X · \+\{promotionAmount\} B3TR/);
});

test('unresolved enrichment never guesses an immediate payout amount', () => {
  assert.match(home, /progressCopy\.fixedReward/);
  assert.match(home, /claimAmount \?/);
});

test('Claim remains owned by the existing core flow', () => {
  assert.match(home, /fetch\('\/api\/rewards\/claims'/);
  assert.doesNotMatch(home, /\/api\/rewards\/x-promotion\/submit/);
});
