import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateAdaptiveRewardBoost } from '../src/lib/rewards/adaptiveRewardBoostShadow.ts';

const b3tr = (amount) => (BigInt(amount)*10n**18n).toString();
function shadow(overrides = {}) {
  return simulateAdaptiveRewardBoost({
    currentlyDesignatedWei:b3tr(1108),
    officialAllocationWei:b3tr(554),
    bankBalanceWei:b3tr(1014),
    bankStressReserveWei:b3tr(232),
    physicalExtraHeadroomWei:b3tr(3400),
    currentStressRecipients:4,
    ...overrides,
  });
}

test('uses a capped independent reserve boost without changing the live quote', () => {
  const s = shadow();
  assert.equal(s.shadowOnly, true);
  assert.equal(s.requiresAuditedCohortRelease, true);
  assert.equal(s.candidateExtraReleaseWei, b3tr(277));
  assert.equal(s.currentlyPayablePerInviteWei, b3tr(277));
  assert.equal(s.simulatedAfterReleasePerInviteWei, b3tr(346) + '250000000000000');
  assert.equal(s.bankLeftAfterCandidateWei, b3tr(737));
});

test('never uses source reserve below stress protection, even with plenty of physical funds', () => {
  const s=shadow({bankBalanceWei:b3tr(250),bankStressReserveWei:b3tr(249)});
  assert.equal(s.candidateExtraReleaseWei,b3tr(1));
  assert.equal(s.bankLeftAfterCandidateWei,b3tr(249));
});
test('cannot suggest a release beyond physical headroom', () => {
  const s=shadow({physicalExtraHeadroomWei:b3tr(10)});
  assert.equal(s.candidateExtraReleaseWei,b3tr(10));
});
test('no extra funds, no change in quote; a large balance by itself is not permission', () => {
  const s=shadow({physicalExtraHeadroomWei:'0'});
  assert.equal(s.candidateExtraReleaseWei,'0');
  assert.equal(s.currentlyPayablePerInviteWei,s.simulatedAfterReleasePerInviteWei);
});
test('bursty participation reduces both current and conditional shadow quotes', () => {
  const low=shadow({currentStressRecipients:4});
  const high=shadow({currentStressRecipients:12});
  assert.ok(BigInt(high.simulatedAfterReleasePerInviteWei)<BigInt(low.simulatedAfterReleasePerInviteWei));
  assert.equal(high.protectedRecipients,12);
  assert.ok(BigInt(high.simulatedAfterReleasePerInviteWei)*12n <= b3tr(1108+277));
});
test('zero users still protects four people; no division by zero', () => {
  assert.equal(shadow({currentStressRecipients:0}).protectedRecipients,4);
});
test('rejects malformed, negative or non-integer budget inputs rather than minting hypothetical funds', () => {
  assert.throws(()=>shadow({bankBalanceWei:'-1'}),/bankBalanceWei/);
  assert.throws(()=>shadow({officialAllocationWei:'1.0'}),/officialAllocationWei/);
  assert.throws(()=>shadow({currentStressRecipients:1.2}),/currentStressRecipients/);
});
