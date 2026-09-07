import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL(
    '../src/app/api/invites/[code]/claim/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const recovery = await readFile(
  new URL(
    '../src/lib/referrals/legacyClaimRecovery.ts',
    import.meta.url,
  ),
  'utf8',
);

test('legacy claim retries authenticate the claimed wallet before recovery', () => {
  const authIndex = route.indexOf('await requireWalletSession');
  const usedIndex = route.indexOf('if (invitation.invitee_wallet)');

  assert.ok(authIndex >= 0);
  assert.ok(usedIndex > authIndex);
  assert.match(route, /recoverCommittedLegacyInviteClaim/);
  assert.match(route, /recoverClaimResponse\(\s*normalizedCode,\s*inviteeAddress/);
});

test('a concurrent legacy claim can recover after the atomic RPC reports ALREADY_USED', () => {
  assert.match(
    route,
    /claimResult\?\.result === 'ALREADY_USED'[\s\S]*recoverClaimResponse\(\s*normalizedCode,\s*inviteeAddress/,
  );
  assert.match(route, /outcome: 'eligible'/);
});

test('legacy recovery requires exact modern eligibility evidence and never guesses old rows', () => {
  assert.match(recovery, /invitation\.eligibility_check_id === null/);
  assert.match(recovery, /\.eq\('id', invitation\.eligibility_check_id\)/);
  assert.match(
    recovery,
    /normalizeWallet\(invitation\.invitee_wallet\) !== normalizedWallet/,
  );
  assert.match(
    recovery,
    /eligibility\.invite_code\.trim\(\)\.toUpperCase\(\) !== normalizedCode/,
  );
  assert.match(
    recovery,
    /normalizeWallet\(eligibility\.wallet_address\) !== normalizedWallet/,
  );
  assert.match(recovery, /eligibility\.outcome !== 'ELIGIBLE'/);
  assert.match(
    recovery,
    /eligibility\.entry_class !== 'NEW'[\s\S]*eligibility\.entry_class !== 'RETURNING'/,
  );
  assert.match(recovery, /return null;/);
});
