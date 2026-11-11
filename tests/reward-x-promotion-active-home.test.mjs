import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [followup, route, panel, claim] = await Promise.all([
  read('src/components/RewardPaidXFollowups.tsx'),
  read('src/app/api/rewards/x-promotion/active/route.ts'),
  read('src/components/RewardXPromotionPanel.tsx'),
  read('src/app/api/rewards/x-promotion/route.ts'),
]);

test('a pending X bonus survives the old 26h hard-coded Home cutoff', () => {
  assert.doesNotMatch(followup, /26 \* 60 \* 60|earliest|\.slice\(0, 4\)/u);
  assert.match(followup, /recentPaidXBonuses/u);
  assert.match(followup, /activeCodes\.has\(invite\.code\)/u);
  assert.match(followup, /RewardXPromotionPanel/u);
});

test('Home fetches held obligations once, and refreshes only on user focus', () => {
  assert.match(followup, /\/api\/rewards\/x-promotion\/active/u);
  assert.match(followup, /REFRESH_ON_FOCUS_MS = 15_000/u);
  assert.match(followup, /credentials: 'same-origin'/u);
  assert.match(followup, /active\?\.wallet === wallet/u);
  assert.match(followup, /document\.addEventListener\('visibilitychange', refreshOnFocus\)/u);
});

test('active offer discovery is strictly authenticated and scoped to wallet, network, and HELD liability', () => {
  assert.match(route, /requireWalletSession\(\{ request \}\)/u);
  assert.match(route, /\.eq\('recipient_wallet', wallet\)/u);
  assert.match(route, /\.eq\('network', network\)/u);
  assert.match(route, /\.in\('financial_state', \['RESERVED', 'HELD'\]\)/u);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|rpc\(/u);
  assert.match(route, /'Cache-Control': 'no-store'/u);
});

test('X opportunity state is authoritative even after the post deadline', () => {
  assert.match(claim, /verificationState === 'INITIAL_VERIFIED'[\s\S]*return 'RETENTION'/u);
  assert.match(claim, /verificationState === 'FINAL_VERIFIED'[\s\S]*return 'PAYOUT_PENDING'/u);
  assert.match(panel, /'VERIFYING', 'RETENTION',/u);
  assert.match(panel, /'REVIEW_REQUIRED', 'PAYOUT_PENDING'/u);
  assert.match(panel, /state\?\.promotionPending !== true/u);
  assert.doesNotMatch(route, /24 \* 60 \* 60|rewardClaimRequestedAt/u);
});
