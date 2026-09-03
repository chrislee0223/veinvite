import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile('src/components/HomeClient.tsx', 'utf8');

test('Home restores permanent referral links from wallet-scoped session storage', () => {
  assert.match(source, /REFERRAL_LINK_SESSION_PREFIX/);
  assert.match(source, /window\.sessionStorage\.getItem\(referralLinkSessionKey\(wallet\)\)/);
  assert.match(source, /wallet\.toLowerCase\(\)/);
  assert.match(source, /isReferralKey\(parsed\.key\)/);
  assert.match(source, /writeCachedReferralLink\(requestWallet, linkData\.referralLink\)/);
});

test('cached links stay non-authoritative until the server verifies them', () => {
  assert.match(source, /setReferralLinkVerified\(false\)/);
  assert.match(source, /setReferralLinkVerified\(true\)/);
  assert.match(source, /disabled=\{!referralLinkVerified \|\| !permanentInviteUrl\}/);
  assert.match(source, /shareDisabled=\{!referralLinkVerified \|\| !permanentInviteUrl\}/);
  assert.match(source, /sameWallet\(activeWalletRef\.current, requestWallet\)/);
});

test('refresh never claims to create a new link and never guesses slot counts', () => {
  assert.doesNotMatch(source, /loading \? t\.creating/);
  assert.match(source, /invitesReady \? \(/);
  assert.match(source, /<span>—\/2<\/span>/);
  assert.match(source, /className="slotSkeleton"/);
});

test('server remains authoritative and the referral ensure endpoint is unchanged', () => {
  assert.match(source, /fetch\('\/api\/referral-links', \{/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /setReferralLink\(linkData\.referralLink\)/);
});
