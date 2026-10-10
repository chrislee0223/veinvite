import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { REWARD_X_PROMOTION_COPY } from '../src/lib/i18n/rewardXPromotionCopy.ts';
import {
  buildRewardXPromotionShareUrl,
  parseRewardXPromotionSnapshot,
} from '../src/lib/rewards/rewardXPromotionClient.ts';

const component = await readFile(
  new URL('../src/components/RewardReceiptView.tsx', import.meta.url),
  'utf8',
);

const SUPPORTED_LOCALES = [
  'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar','bn','pt',
  'ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw','ha','el','cs',
];

test('promotion share URL is bound to the canonical production referral URL', () => {
  const token = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(
    buildRewardXPromotionShareUrl(
      'https://veinvite.vercel.app/s/abcdefghijklmnop',
      token,
    ),
    `https://veinvite.vercel.app/s/abcdefghijklmnop?xp=${token}`,
  );

  assert.equal(
    buildRewardXPromotionShareUrl(
      'https://example.com/s/abcdefghijklmnop',
      token,
    ),
    null,
  );
  assert.equal(
    buildRewardXPromotionShareUrl(
      'https://veinvite.vercel.app/s/abcdefghijklmnop?foo=bar',
      token,
    ),
    null,
  );
  assert.equal(
    buildRewardXPromotionShareUrl(
      'https://veinvite.vercel.app/s/abcdefghijklmnop#fragment',
      token,
    ),
    null,
  );
  assert.equal(
    buildRewardXPromotionShareUrl(
      'https://veinvite.vercel.app/s/abcdefghijklmnop',
      'not-a-token',
    ),
    null,
  );
});

test('promotion state parser fails closed on malformed server state', () => {
  const valid = parseRewardXPromotionSnapshot({
    inviteCode: 'ABCDEFG',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-10T00:00:00.000Z',
    postDeadlineAt: '2026-10-11T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  });

  assert.equal(valid?.state, 'OPEN');
  assert.equal(valid?.amountB3tr, '10');

  assert.equal(
    parseRewardXPromotionSnapshot({
      inviteCode: 'ABCDEFG',
      state: 'OPEN',
      amountWei: '10000000000000000000',
      amountB3tr: '10',
      postDeadlineAt: '2026-10-11T00:00:00.000Z',
      submissionGraceSeconds: 900,
      shareToken: null,
    }),
    null,
  );

  assert.equal(
    parseRewardXPromotionSnapshot({
      inviteCode: 'ABCDEFG',
      state: 'UNKNOWN',
      amountWei: '1',
      amountB3tr: '0.000000000000000001',
      postDeadlineAt: '2026-10-11T00:00:00.000Z',
      submissionGraceSeconds: 0,
    }),
    null,
  );
});

test('all supported notification locales have X promotion copy', () => {
  assert.deepEqual(
    Object.keys(REWARD_X_PROMOTION_COPY).sort(),
    [...SUPPORTED_LOCALES].sort(),
  );

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    assert.ok(copy.shareBonus.includes('{amount}'), `${locale} share bonus amount placeholder`);
    assert.ok(copy.verifyPost.length > 0, `${locale} verify copy`);
    assert.ok(copy.retention.length > 0, `${locale} retention copy`);
    assert.ok(copy.paid.length > 0, `${locale} paid copy`);
  }
});

test('reward receipt uses wallet-bound promotion GET and POST endpoints', () => {
  assert.match(
    component,
    /\/api\/rewards\/x-promotion\?inviteCode=/,
  );
  assert.match(
    component,
    /['"]\/api\/rewards\/x-promotion\/submit['"]/,
  );
  assert.match(
    component,
    /body:\s*JSON\.stringify\(\{[\s\S]*inviteCode:[\s\S]*postUrl:/,
  );
});

test('promotion share never acknowledges the referral reward receipt', () => {
  const shareBlock = /const sharePromotionOnX = \(\) => \{([\s\S]*?)\n  \};/u.exec(component);
  assert.ok(shareBlock);
  assert.match(shareBlock[1], /window\.open/);
  assert.doesNotMatch(shareBlock[1], /acknowledge|onRewardShare/u);
});

test('existing generic X share remains the fail-soft fallback', () => {
  assert.match(
    component,
    /\) : rewardShareIntentUrl \? \(/,
  );
  assert.match(
    component,
    /Promotion is optional\. The existing reward receipt\/share UI remains usable\./,
  );
});

test('promotion UI keeps link entry usable during submission grace', () => {
  assert.match(
    component,
    /promotion\.state === 'OPEN' \|\|[\s\S]*promotion\.state === 'SUBMISSION_GRACE'/,
  );
  assert.match(
    component,
    /promotion\.state === 'OPEN' && promotionShareIntentUrl/,
  );
});
