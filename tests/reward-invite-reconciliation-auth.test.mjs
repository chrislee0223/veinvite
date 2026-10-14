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
const homePage = readFileSync(
  new URL(
    '../src/app/page.tsx',
    import.meta.url,
  ),
  'utf8',
);
const inviterRefresh = readFileSync(
  new URL(
    '../src/components/InviteStatusAutoRefresh.tsx',
    import.meta.url,
  ),
  'utf8',
);
const homeClient = readFileSync(
  new URL('../src/components/HomeClient.tsx', import.meta.url),
  'utf8',
);

test('mission reconciliation requires an authenticated referral owner before consuming shared sync budget', () => {
  assert.match(inviteRoute, /requireWalletSession/u);
  assert.match(inviteRoute, /sessionWallet\s*=\s*session\.walletAddress\.toLowerCase\(\)/u);
  assert.match(inviteRoute, /normalizedInvitee === sessionWallet/u);
  assert.match(inviteRoute, /normalizedInviter === sessionWallet/u);
  assert.match(inviteRoute, /const sessionOwnsReferral/u);
  assert.match(inviteRoute, /if \(!sessionOwnsReferral\)/u);
  assert.match(inviteRoute, /The verified wallet does not match this invitation\./u);

  const postStart = inviteRoute.indexOf('export async function POST');
  const authStart = inviteRoute.indexOf('requireWalletSession({ request })', postStart);
  const rowLoad = inviteRoute.indexOf('row = await loadInvitation(normalizedCode)', postStart);
  const walletMatch = inviteRoute.indexOf('const sessionOwnsReferral', postStart);
  const syncRateLimit = inviteRoute.indexOf("mode: 'sync'", postStart);
  const reconciliation = inviteRoute.indexOf('syncInvitationEvidence(row)', postStart);

  assert.ok(postStart >= 0);
  assert.ok(authStart > postStart);
  assert.ok(rowLoad > authStart);
  assert.ok(walletMatch > rowLoad);
  assert.ok(syncRateLimit > walletMatch);
  assert.ok(reconciliation > syncRateLimit);
});

test('inviter Home is the sole low-frequency client reconciler; passive poll cannot cause payouts', () => {
  assert.match(homePage, /<WalletSessionGate/u);
  assert.match(homePage, /<InviteStatusAutoRefresh \/>/u);
  assert.doesNotMatch(inviterRefresh, /method:\s*'POST'/u);
  assert.match(inviterRefresh, /const POLL_INTERVAL_MS = 30_000/u);
  assert.match(homeClient, /const EVIDENCE_REFRESH_MS = 120_000/u);
  assert.match(homeClient, /acceptedActiveInvites\.slice\(0, 2\)/u);
  assert.match(homeClient, /for \(const invite of dueInvites\)/u);
  assert.match(homeClient, /method: 'POST'/u);
  assert.match(homeClient, /credentials: 'same-origin'/u);
  assert.match(homeClient, /signal: AbortSignal\.timeout\(15_000\)/u);
  assert.match(homeClient, /evidenceSyncAttemptRef\.current\.set\(key, Date\.now\(\)\)/u);
});

test('shared-network headroom grows without weakening per-invite reconciliation limits', () => {
  assert.match(inviteRoute, /const INVITE_READ_CODE_LIMIT = 720;/u);
  assert.match(inviteRoute, /const INVITE_SYNC_CODE_LIMIT = 240;/u);
  assert.match(inviteRoute, /const INVITE_READ_IP_LIMIT = 7200;/u);
  assert.match(inviteRoute, /const INVITE_SYNC_IP_LIMIT = 2400;/u);
  assert.match(inviteRoute, /scope: 'invite_progress_code'/u);
  assert.match(inviteRoute, /scope: 'invite_progress_sync_code'/u);
});

test('passive invite reads stay public but reveal details only to the verified referral owner', () => {
  const getStart = inviteRoute.indexOf('export async function GET');
  const postStart = inviteRoute.indexOf('export async function POST');
  const getBody = inviteRoute.slice(getStart, postStart);

  assert.ok(getStart >= 0);
  assert.ok(postStart > getStart);
  assert.doesNotMatch(getBody, /requireWalletSession\(\{ request \}\)/u);
  assert.match(getBody, /getWalletSession\(request\)/u);
  assert.match(getBody, /sessionCanReadInvitationDetails/u);
  assert.match(getBody, /toPublicInviteRecord\(row\)/u);
  assert.match(getBody, /toPublicProgress\(\)/u);
  assert.match(inviteRoute, /inviterAddress: ''/u);
  assert.match(inviteRoute, /row\.invitee_wallet\?\.toLowerCase\(\)/u);
  assert.match(invitePage, /<WalletSessionGate(?:\s|>)/u);
  assert.match(invitePage, /<InviteeClient code=\{normalizedCode\} \/>/u);
});