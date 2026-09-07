import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [ownerApi, claimApi, legacyInviteApi, legacyClaimApi] = await Promise.all([
  readFile(new URL('../src/app/api/referral-links/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/referral-links/[key]/claim/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/invites/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/invites/[code]/claim/route.ts', import.meta.url), 'utf8'),
]);

function assertReservationAwareCapacity(source, label) {
  assert.match(
    source,
    /slot_released_at:\s*string\s*\|\s*null/i,
    `${label} must read the slot release marker`,
  );
  assert.match(
    source,
    /\.select\('[^']*slot_released_at[^']*'\)/i,
    `${label} must select slot_released_at`,
  );
  assert.match(
    source,
    /\.in\('status',\s*\[[^\]]*'COMPLETED'[^\]]*\]\)/i,
    `${label} must include COMPLETED invitations in capacity reads`,
  );
  assert.match(
    source,
    /invitation\.status === 'COMPLETED'[\s\S]*invitation\.slot_released_at === null/i,
    `${label} must hold a completed slot until reward reservation releases it`,
  );
}

test('owner slot availability stays aligned with the database reservation-release rule', () => {
  assertReservationAwareCapacity(ownerApi, 'owner API');
});

test('claim capacity precheck stays aligned with the database reservation-release rule', () => {
  assertReservationAwareCapacity(claimApi, 'claim API');
});

test('legacy one-time creation treats an unreleased completed slot as active', () => {
  assert.match(
    legacyInviteApi,
    /const activeInviteStatuses:[\s\S]*'COMPLETED'/i,
    'legacy invite lookup must include completed invitations',
  );
  assert.match(
    legacyInviteApi,
    /invitation\.status === 'COMPLETED'[\s\S]*hasEntryProof\(invitation\)[\s\S]*invitation\.slot_released_at === null/i,
    'legacy invite creation must return a conflict while a completed slot is held for reward reservation',
  );
});

test('legacy claim safely resumes only the same authenticated wallet', () => {
  const authIndex = legacyClaimApi.indexOf('await requireWalletSession({');
  const retryIndex = legacyClaimApi.indexOf('const assignedInvitee =');
  const eligibilityScanIndex = legacyClaimApi.indexOf('await checkVeBetterEntryEligibility({');

  assert.ok(authIndex >= 0, 'legacy claim must authenticate the requested wallet');
  assert.ok(retryIndex > authIndex, 'stored claim ownership must be checked only after wallet authentication');
  assert.ok(
    eligibilityScanIndex > retryIndex,
    'a committed same-wallet retry must be recoverable before a fresh eligibility scan',
  );
  assert.match(
    legacyClaimApi,
    /assignedInvitee !== inviteeAddress[\s\S]*outcome: 'already_used'[\s\S]*status: 409/,
    'a different wallet must remain unable to reuse an occupied invite',
  );
  assert.match(
    legacyClaimApi,
    /\.from\('eligibility_check_events'\)[\s\S]*\.eq\('outcome', 'ELIGIBLE'\)/,
    'same-wallet retry classification must come from persisted eligibility evidence',
  );
  assert.match(
    legacyClaimApi,
    /const retryEntryClass =[\s\S]*loadStoredEntryClassForRetry[\s\S]*outcome: 'eligible'[\s\S]*entryClass: retryEntryClass[\s\S]*status: 200/,
    'a same-wallet retry must reproduce the original successful claim contract',
  );
  assert.match(
    legacyClaimApi,
    /outcome: 'retry_state_unavailable'[\s\S]*status: 503/,
    'missing persisted eligibility evidence must fail closed instead of reclassifying the wallet',
  );
});
