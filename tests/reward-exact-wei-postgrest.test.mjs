import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { exactWeiFromDb } from '../src/lib/rewards/exactWei.ts';

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const actual = '1459280125541217311130'; // Production VD3A4SR fixed 1,459.280125541217311130 B3TR

test('large exact Wei remains lossless only when PostgREST returns text', () => {
  const unsafe = JSON.parse(`{\"amount\":${actual}}`).amount;
  assert.notEqual(String(unsafe), actual);
  assert.equal(exactWeiFromDb(unsafe), null);
  assert.equal(exactWeiFromDb(JSON.parse(`{\"amount\":\"${actual}\"}`).amount), actual);
  assert.equal(BigInt(actual) + 10000000000000000000n, 1469280125541217311130n);
});

test('Wei decoding fails closed on unsafe numeric/scientific/negative inputs', () => {
  for (const bad of [null, undefined, 0, 10000000000000000000, 1.4592801255412172e21, '1e21', '-1', '1.0', '01', '', ' 1']) {
    assert.equal(exactWeiFromDb(bad), null);
  }
  assert.equal(exactWeiFromDb('0'), '0');
  assert.equal(exactWeiFromDb('10000000000000000000'), '10000000000000000000');
});

test('all user-facing referral and X amounts are cast at the database read boundary', () => {
  const checks = [
    ['src/app/api/invites/route.ts', ['reserved_amount_wei::text', 'reservation_amount_wei::text', 'base_amount_wei::text', 'promotion_amount_wei::text']],
    ['src/app/api/notifications/reward-actions/route.ts', ['reserved_amount_wei::text', 'reservation_amount_wei::text', 'base_amount_wei::text', 'promotion_amount_wei::text']],
    ['src/lib/rewards/rewardReceipt.ts', ['amount_wei::text']],
    ['src/app/api/rewards/x-promotion/route.ts', ['promotion_amount_wei::text']],
    ['src/lib/rewards/rewardXPromotionPayoutExecutor.ts', ['amount_wei::text']],
  ];
  for (const [file, fields] of checks) {
    const content = source(file);
    for (const field of fields) assert.ok(content.includes(field), `${file} missing ${field}`);
  }
});

test('optional split inconsistency cannot take down all inviter actions', () => {
  const invites = source('src/app/api/invites/route.ts');
  const actions = source('src/app/api/notifications/reward-actions/route.ts');
  assert.match(invites, /Invalid LIVE X promotion split in invitation reward display/);
  assert.match(invites, /return toInviteRecord\(invitation\);/);
  assert.match(actions, /Invalid LIVE X promotion split in reward action display:[\s\S]*return \[\];/);
  assert.match(invites, /requireWalletSession/);
  assert.match(actions, /requireWalletSession/);
});
