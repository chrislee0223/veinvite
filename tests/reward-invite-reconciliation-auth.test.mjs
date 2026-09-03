import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const inviteRoute = readFileSync(
  new URL(
    '../src/app/api/invites/[code]/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const invitePage = readFileSync(
  new URL(
    '../src/app/i/[code]/page.tsx',
    import.meta.url,
  ),
  'utf8',
);

test('mission reconciliation requires the authenticated invitee before consuming shared sync budget', () => {
  assert.match(inviteRoute, /requireWalletSession/u);
  assert.match(inviteRoute, /sessionWallet\s*=\s*session\.walletAddress\.toLowerCase\(\)/u);
  assert.match(inviteRoute, /row\.invitee_wallet\.toLowerCase\(\) !== sessionWallet/u);
  assert.match(inviteRoute, /The verified wallet does not match this invitation\./u);

  const postStart = inviteRoute.indexOf('export async function POST');
  const authStart = inviteRoute.indexOf('requireWalletSession({ request })', postStart);
  const rowLoad = inviteRoute.indexOf('row = await loadInvitation(normalizedCode)', postStart);
  const walletMatch = inviteRoute.indexOf("row.invitee_wallet.toLowerCase() !== sessionWallet", postStart);
  const syncRateLimit = inviteRoute.indexOf("mode: 'sync'", postStart);
  const reconciliation = inviteRoute.indexOf('syncInvitationEvidence(row)', postStart);

  assert.ok(postStart >= 0);
  assert.ok(authStart > postStart);
  assert.ok(rowLoad > authStart);
  assert.ok(walletMatch > rowLoad);
  assert.ok(syncRateLimit > walletMatch);
  assert.ok(reconciliation > syncRateLimit);
});

test('passive invite reads remain public while the invite page retains its wallet-session gate', () => {
  assert.match(inviteRoute, /export async function GET/u);
  assert.match(inviteRoute, /Passive public read\./u);
  assert.match(invitePage, /<WalletSessionGate>/u);
  assert.match(invitePage, /<InviteeClient code=\{normalizedCode\} \/>/u);
});
