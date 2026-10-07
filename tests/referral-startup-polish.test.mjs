import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [boundary, permanentClient, inviteClient] = await Promise.all([
  readFile(
    new URL('../src/components/ReferralWalletBootstrapBoundary.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/components/PermanentReferralClient.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/components/InviteeClient.tsx', import.meta.url),
    'utf8',
  ),
]);

test('referral startup skips delay when no wallet restoration is expected', () => {
  assert.match(
    boundary,
    /!hasPersistedWallet && !connection\?\.isLoading/,
  );
  assert.match(
    boundary,
    /Boolean\(initialSessionWallet \|\| walletAddress\)/,
  );
  assert.match(
    boundary,
    /if \(connection\?\.isLoading\) \{\s*return;/s,
  );
});

test('permanent referral hides initial validation behind the stable brand surface', () => {
  assert.match(permanentClient, /initialValidationResolved/);
  assert.match(
    permanentClient,
    /data-veinvite-referral-client-bootstrap="pending"/,
  );
  assert.match(
    permanentClient,
    /if \(!initialValidationResolved\)/,
  );
});

test('invitee resolves the real first screen before revealing landing', () => {
  assert.match(inviteClient, /resolveInitialInviteStep/);
  assert.match(inviteClient, /initialInviteResolved/);
  assert.match(inviteClient, /walletRef\.current/);
  assert.match(
    inviteClient,
    /data-veinvite-invite-client-bootstrap="pending"/,
  );
  assert.match(inviteClient, /if \(!initialInviteResolved\)/);
});

test('legacy invite claim no longer adds a cosmetic 850ms wait', () => {
  assert.doesNotMatch(
    inviteClient,
    /setTimeout\(resolve, 850\)/,
  );
});
