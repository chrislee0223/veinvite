import assert from 'node:assert/strict';
import test from 'node:test';
import { previewRewardAdmission } from '../src/lib/rewards/rewardAdmissionShadow.ts';

const W = 10n ** 18n;
const b = n => (BigInt(n) * W).toString();
const input = (opts = {}) => ({
  cohortEffectiveBudgetWei: b(1469), cohortLifetimeCommittedWei: '0',
  existingCohortMinimumReservationsWei: '0', physicalPoolWei: b(8031),
  unpaidFixedLiabilitiesWei: '0', protectedOlderCohortsWei: b(5000),
  otherReservedLiabilitiesWei: '0', safetyBufferWei: b(200),
  uncoveredOlderCompletionStressWei: '0', minimumPerNewAdmissionWei: b(5),
  requestedNewAdmissions: 1, currentAdmissionCount: 0,
  poolObservedAt: '2026-11-03T14:00:00Z', evaluatedAt: '2026-11-03T14:00:02Z',
  fundingReceiptVerified: true, liabilitiesReconciled: true,
  acceptingNewAdmissions: true, ...opts,
});
test('293 seats at five B3TR fit; preview cannot authorize', () => {
  const x=previewRewardAdmission(input({requestedNewAdmissions:293}));
  assert.equal(x.status,'WOULD_FIT');
  assert.equal(x.maxAdditionalSeats,'293');
  assert.equal(x.authorizesAdmission,false);
  assert.equal(x.writesPerformed,false);
});
test('294 or 1000 seats fail to fit the same finite cohort budget', () => {
  for(const n of [294,1000]){
    assert.equal(previewRewardAdmission(input({requestedNewAdmissions:n})).status,'INSUFFICIENT_FUNDS');
  }
});
test('physical protected funds and buffer outrank an uncommitted cohort budget', () => {
  const x=previewRewardAdmission(input({protectedOlderCohortsWei:b(7828)}));
  assert.equal(x.status,'INSUFFICIENT_FUNDS');
  assert.equal(x.maxAdditionalSeats,'0');
});
test('existing reservation is subtracted once and old minimum must be covered', () => {
  const x=previewRewardAdmission(input({
    existingCohortMinimumReservationsWei:b(400), currentAdmissionCount:80,
  }));
  assert.equal(x.status,'WOULD_FIT');
  assert.equal(x.maxAdditionalSeats,'213');
  assert.equal(previewRewardAdmission(input({
    existingCohortMinimumReservationsWei:b(20), currentAdmissionCount:80,
  })).status,'ACCOUNTING_INCONSISTENT');
});
test('stale pool, missing receipt, inconsistent liabilities and legacy risk fail closed', () => {
  const cases=[
    [{fundingReceiptVerified:false},'FUNDING_EVIDENCE_MISSING'],
    [{poolObservedAt:'2026-11-03T13:00:00Z'},'STALE_POOL_OBSERVATION'],
    [{liabilitiesReconciled:false},'LIABILITIES_UNVERIFIED'],
    [{uncoveredOlderCompletionStressWei:b(1)},'UNRESOLVED_LEGACY_STRESS'],
    [{acceptingNewAdmissions:false},'ADMISSION_CLOSED'],
  ];
  for(const [opts,status] of cases){
    const x=previewRewardAdmission(input(opts));
    assert.equal(x.status,status);
    assert.equal(x.safeShadowCapacityWei,'0');
  }
});
test('ledger contradictions refuse to show admissions', () => {
  assert.equal(previewRewardAdmission(input({
    cohortLifetimeCommittedWei:b(1500),
  })).status,'ACCOUNTING_INCONSISTENT');
  assert.equal(previewRewardAdmission(input({
    unpaidFixedLiabilitiesWei:b(9000),
  })).status,'ACCOUNTING_INCONSISTENT');
});
test('atomic update must occur before the next preview', () => {
  const before=input({existingCohortMinimumReservationsWei:b(1460),currentAdmissionCount:292});
  assert.equal(previewRewardAdmission(before).status,'WOULD_FIT');
  assert.equal(previewRewardAdmission(before).status,'WOULD_FIT');
  assert.equal(previewRewardAdmission(before).implementationPrerequisite,
    'ATOMIC_DB_ADMISSION_WITH_IDEMPOTENT_LEDGER');
  const after={...before,existingCohortMinimumReservationsWei:b(1465),currentAdmissionCount:293};
  assert.equal(previewRewardAdmission(after).status,'INSUFFICIENT_FUNDS');
});
test('malformed financial values, timestamps and counts are rejected', () => {
  for(const change of [
    {physicalPoolWei:'-1'},{minimumPerNewAdmissionWei:'0'},
    {requestedNewAdmissions:0},{requestedNewAdmissions:0.5},
    {currentAdmissionCount:-1},{evaluatedAt:'2026-11-03'},
  ]) assert.throws(()=>previewRewardAdmission(input(change)));
});
