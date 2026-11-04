import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const service = readFileSync(new URL('../src/lib/rewards/admissionGuaranteeActivation.ts',import.meta.url),'utf8');
const legacy = readFileSync(new URL('../src/app/api/invites/[code]/claim/route.ts',import.meta.url),'utf8');
const permanent = readFileSync(new URL('../src/app/api/referral-links/[key]/claim/route.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261104193600_reward_admission_funded_hold_entry_disabled.sql',import.meta.url),'utf8');

test('both referral entry paths call funding only after durable claimed status, never before',()=>{
  assert.match(legacy,/claimResult\.result !== 'CLAIMED'[\s\S]*maybeReserveFundedReferralMinimumAfterActivation/);
  assert.match(permanent,/case 'CLAIMED': \{[\s\S]*maybeReserveFundedReferralMinimumAfterActivation/);
  for (const source of [legacy,permanent]) {
    assert.match(source,/catch \(fundingError\)/);
    assert.doesNotMatch(source,/outcome: 'claimed'[\s\S]*guaranteedWei/i);
  }
});

test('entry requires opt-in policy and checks true onchain pool plus finalized block',()=>{
  assert.match(service,/VEINVITE_ADMISSION_GUARANTEE_ENABLED !== 'true'/);
  assert.match(service,/VEINVITE_ADMISSION_GUARANTEE_MINIMUM_WEI/);
  assert.match(service,/VEINVITE_ADMISSION_STRESS_BUFFER_WEI/);
  assert.match(service,/if \(hold\.admissionEnabled !== true\) return 'DISABLED'/);
  assert.match(service,/readVeInviteRewardPoolStatus/);
  assert.match(service,/getBlockCompressed\('finalized'\)/);
  assert.match(service,/evaluateAdmissionPreflight/);
  assert.match(service,/create_reward_admission_hold_v1/);
  assert.match(service,/planning\.forecast\.rewardPerInviteWei/);
  assert.match(service,/p_expected_physical_wei:planning\.reservedExistingWei/);
  assert.match(service,/p_expected_cohort_wei:planning\.cohortReservedWei/);
  assert.doesNotMatch(service,/sendTransaction|signTransaction|\.insert\(|\.update\(/);
});

test('service-only entry writer cannot alter hard-disabled Production settings',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.create_reward_admission_hold_v1/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.create_reward_admission_hold_v1/);
  assert.match(sql,/FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/TO service_role/);
  assert.match(sql,/p_observed_at < clock_timestamp\(\)-interval '120 seconds'/);
  assert.match(sql,/v_inv\.activation_block>p_finalized_block/);
  assert.match(sql,/v_inv\.sybil_status NOT IN \('NOT_CHECKED','CLEAR'\)/);
  assert.match(sql,/ADMISSION_POST_COMMIT_LEDGER_DRIFT/);
  assert.doesNotMatch(sql,/DROP CONSTRAINT settings_enabled_check|UPDATE reward_admission_bridge\.settings|GRANT EXECUTE[\s\S]*TO anon/i);
});
