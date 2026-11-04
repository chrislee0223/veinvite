import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAdmissionPreflight } from '../src/lib/rewards/rewardAdmissionPreflight.ts';
const E = 10n ** 18n;
const base = (overrides = {}) => ({
 invitationStatus:'ACTIVATING', sybilStatus:'NOT_CHECKED',
 rewardCohortRoundId:'123', allocationReceiptId:'111',
 existingAdmissionHold:false, canonicalFixedRewardExists:false,
 onchainAvailablePoolWei:String(8000n*E),
 physicalLiabilityIncludingHeldWei:String(500n*E),
 cohortBudgetWei:String(1000n*E),
 cohortCommittedIncludingHeldWei:String(100n*E),
 stressReserveWei:String(200n*E),
 configuredMinimumWei:String(10n*E),
 distributionPaused:false, ...overrides,
});

test('preflight permits analysis of a funded activated invite but never makes a payout promise', () => {
 const r=evaluateAdmissionPreflight(base());
 assert.equal(r.decision,'PRECHECK_ONLY');
 assert.deepEqual(r.reasons,[]);
 assert.equal(r.conservativeMaximumWei,String(900n*E));
 for (const k of ['canPromiseToInvitee','canWriteAdmissionHold','canSignOrPay','financialWritesPerformed']) {
   assert.equal(r[k],false,k);
 }
});

test('pending acceptance has no bound cohort and no unbacked admission promise', () => {
 const r=evaluateAdmissionPreflight(base({
   invitationStatus:'PENDING_ACCEPTANCE',rewardCohortRoundId:null,allocationReceiptId:null,
 }));
 assert.equal(r.decision,'BLOCKED');
 assert.ok(r.reasons.includes('NOT_ACTIVE_BOUND_INVITATION'));
 assert.ok(r.reasons.includes('OFFICIAL_COHORT_RECEIPT_NOT_BOUND'));
});

test('any existing hold or canonical reward blocks duplicate admission', () => {
 for (const flag of ['existingAdmissionHold','canonicalFixedRewardExists']) {
   const r=evaluateAdmissionPreflight(base({[flag]:true}));
   assert.ok(r.reasons.includes('EXISTING_REWARD_OBLIGATION'));
   assert.equal(r.canPromiseToInvitee,false);
 }
});

test('funding is conservatively capped by both physical pool and cohort budget', () => {
 const shortage=evaluateAdmissionPreflight(base({
   onchainAvailablePoolWei:String(711n*E),
   physicalLiabilityIncludingHeldWei:String(500n*E),
   stressReserveWei:String(205n*E),
   configuredMinimumWei:String(10n*E),
 }));
 assert.equal(shortage.conservativeMaximumWei,String(6n*E));
 assert.ok(shortage.reasons.includes('INSUFFICIENT_DOUBLE_CAPPED_FUNDING'));
 const overrun=evaluateAdmissionPreflight(base({
   cohortCommittedIncludingHeldWei:String(1001n*E),
 }));
 assert.equal(overrun.cohortHeadroomWei,'0');
 assert.ok(overrun.reasons.includes('COHORT_ALREADY_OVERCOMMITTED'));
});

test('unreviewed does not masquerade as cleared but Sybil restricted and pause are blocked', () => {
 for (const status of ['BLOCKED','HOLD']) {
   assert.ok(evaluateAdmissionPreflight(base({sybilStatus:status})).reasons.includes('SYBIL_RESTRICTION'));
 }
 assert.ok(evaluateAdmissionPreflight(base({distributionPaused:true})).reasons.includes('DISTRIBUTION_PAUSED'));
});

test('invalid financial literals are rejected, not coerced or rounded', () => {
 for (const bad of ['-1','1.5','001','1e18','NaN','']) {
   assert.throws(()=>evaluateAdmissionPreflight(base({configuredMinimumWei:bad})),/Invalid exact Wei/);
 }
 assert.ok(evaluateAdmissionPreflight(base({configuredMinimumWei:'0'})).reasons.includes('GUARANTEE_MINIMUM_NOT_CONFIGURED'));
});

test('preflight does not access DB keys, sign, or alter payouts', async () => {
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/lib/rewards/rewardAdmissionPreflight.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/supabaseAdmin|SECRET_KEY|\.rpc\(|\.insert\(|\.update\(|sendTransaction|commit_held_to_fixed_v1/);
 assert.match(source,/canPromiseToInvitee: false/);
});
