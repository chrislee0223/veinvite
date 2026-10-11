import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL('../src/app/api/rewards/x-promotion/route.ts', import.meta.url),
  'utf8',
);

test('OPEN X promotion share URL is assembled server-side from the wallet-owned active referral key', () => {
  assert.match(route, /from\('referral_links'\)/);
  assert.match(route, /\.eq\('inviter_wallet', wallet\)/);
  assert.match(route, /\.eq\('status', 'ACTIVE'\)/);
  assert.match(
    route,
    /https:\/\/veinvite\.vercel\.app\/s\/\$\{key\}\?xp=\$\{shareToken\}/,
  );
});

test('share URL and share token are only exposed while the opportunity is OPEN', () => {
  assert.match(route, /if \(state === 'OPEN'\)[\s\S]*shareUrl =/);
  assert.match(
    route,
    /shareToken:[\s\S]*state === 'OPEN'[\s\S]*shareUrl,/,
  );
});

test('referral-link enrichment failure does not hide promotion state', () => {
  assert.match(
    route,
    /X promotion share URL enrichment unavailable/,
  );
  assert.doesNotMatch(
    route,
    /if \(referralLink\.error\)[\s\S]{0,350}status: 500/,
  );
});

test('client rewardShareUrl is not used as promotion identity authority', () => {
  assert.doesNotMatch(route, /rewardShareUrl/);
});
