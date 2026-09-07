import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL(
    '../src/app/api/invites/[code]/cancel/route.ts',
    import.meta.url,
  ),
  'utf8',
);

test('legacy cancellation authenticates and authorizes the inviter before mutation', () => {
  const authIndex = route.indexOf('await requireWalletSession');
  const ownershipIndex = route.indexOf("normalizedInviter !==");
  const updateIndex = route.indexOf(".update({\n      status: 'CANCELLED'");

  assert.ok(authIndex >= 0);
  assert.ok(ownershipIndex > authIndex);
  assert.ok(updateIndex > ownershipIndex);
  assert.match(route, /expectedWallet: normalizedInviter/);
});

test('legacy cancellation remains conditional on an unused pending invitation', () => {
  assert.match(route, /invitation\.status !==[\s\S]*'PENDING_ACCEPTANCE'/);
  assert.match(route, /invitation\.invitee_wallet !== null/);
  assert.match(route, /\.eq\('invite_code', normalizedCode\)/);
  assert.match(route, /\.eq\('inviter_wallet', normalizedInviter\)/);
  assert.match(route, /\.eq\('status', 'PENDING_ACCEPTANCE'\)/);
  assert.match(route, /\.is\('invitee_wallet', null\)/);
});

test('a near-simultaneous cancellation retry recovers only an already cancelled row', () => {
  assert.match(
    route,
    /if \(!cancelledInvitation\)[\s\S]*loadInvitationForInviter\([\s\S]*normalizedCode,[\s\S]*normalizedInviter/,
  );
  assert.match(
    route,
    /retryState\.invitation\?\.status ===[\s\S]*'CANCELLED'[\s\S]*toInviteRecord\([\s\S]*retryState\.invitation/,
  );
  assert.match(route, /Invitation could not be cancelled\./);
  assert.match(route, /\{ status: 409 \}/);
});

test('an already cancelled invitation is idempotent while accepted invitations stay blocked', () => {
  assert.match(
    route,
    /if \(invitation\.status === 'CANCELLED'\)[\s\S]*toInviteRecord\(invitation\)/,
  );
  assert.match(route, /Accepted invitations cannot be cancelled\./);
});
