import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatRewardShareAmount,
  rewardReceiptShareText,
  rewardReceiptXIntentUrl,
} from '../src/lib/rewards/rewardReceiptShare.ts';

test('reward X share copy keeps the agreed readable global layout', () => {
  const text = rewardReceiptShareText({
    locale: 'ko',
    amountB3tr: '193.909518830854471680',
  });

  assert.equal(
    text,
    [
      'I just earned 193.91 #B3TR',
      'by inviting a friend with @Veinvite',
      'on #VeBetterDAO 🎉',
      '',
      'Invite friends. Earn B3TR. 👇',
    ].join('\n'),
  );
});

test('reward X share amount rounds only the social display value', () => {
  assert.equal(formatRewardShareAmount('193.909518830854471680'), '193.91');
  assert.equal(formatRewardShareAmount('193.994'), '193.99');
  assert.equal(formatRewardShareAmount('193.995'), '194');
  assert.equal(formatRewardShareAmount('0.005'), '0.01');
  assert.equal(formatRewardShareAmount('100'), '100');
});

test('reward X intent contains one referral URL and the discovery tags', () => {
  const referralUrl =
    'https://veinvite.vercel.app/s/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdEfGhIjKlMnOpQrStUvWx';
  const intentUrl = rewardReceiptXIntentUrl({
    locale: 'en',
    amountB3tr: '123456789012345678901234567890.126',
    referralUrl,
  });
  const intent = new URL(intentUrl);
  const text = intent.searchParams.get('text');

  assert.ok(text);
  assert.equal(intent.origin, 'https://x.com');
  assert.equal(intent.pathname, '/intent/post');
  assert.equal(text.match(/https:\/\/veinvite\.vercel\.app\/s\//g)?.length, 1);
  assert.match(text, /@Veinvite/);
  assert.match(text, /#B3TR/);
  assert.match(text, /#VeBetterDAO/);
  assert.match(text, /#VeChain #Web3 #Crypto$/);
  assert.ok(text.length < 280);
});
