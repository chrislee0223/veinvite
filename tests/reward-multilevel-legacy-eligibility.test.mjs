import assert from 'node:assert/strict';
import test from 'node:test';
import {qualifyLegacyActiveMembership} from '../src/lib/rewards/multilevelLegacyEligibility.ts';

const wallet='0x'+'a'.repeat(40);
const code='ABC2345';
const invitation={
  inviteCode:code,network:'mainnet',inviteeWallet:wallet,status:'COMPLETED',
  rewardStatus:'PAID',sybilStatus:'CLEAR',identityLinkStatus:'NO_KNOWN_LINK',
  appsCompleted:3,voteCompleted:true,vot3Converted:true,
  vot3ConversionTxId:'0x'+'b'.repeat(64),
  activationBlock:100,appsCompletedBlock:120,voteCompletedBlock:200,
  voteRoundId:129,
};
const assessment={inviteCode:code,network:'mainnet',state:'CLEAR',revision:4};
const input=(overrides={})=>({
  wallet,network:'mainnet',earningRoundId:130,
  invitation:{...invitation},currentAssessment:{...assessment},
  hasActiveInvalidation:false,hasActiveInviteeWalletRestriction:false,
  ...overrides,
});

test('validated pre-launch completed wallet may be active only in later round',()=>{
  assert.deepEqual(qualifyLegacyActiveMembership(input()),
    {eligible:true,firstOnboardedRoundId:129});
  assert.deepEqual(qualifyLegacyActiveMembership(input({earningRoundId:129})),
    {eligible:false,reason:'ONBOARDING_NOT_OLDER_THAN_ROUND'});
});

test('historically invalidated completed PAID record is never active',()=>{
  assert.deepEqual(qualifyLegacyActiveMembership(input({hasActiveInvalidation:true})),
    {eligible:false,reason:'HISTORICALLY_INVALIDATED'});
  assert.deepEqual(qualifyLegacyActiveMembership(input({
    currentAssessment:{...assessment,state:'RESTRICTED'},
  })),{eligible:false,reason:'CURRENT_SYBIL_NOT_CLEAR'});
  assert.deepEqual(qualifyLegacyActiveMembership(input({
    hasActiveInviteeWalletRestriction:true,
  })),{eligible:false,reason:'CURRENT_WALLET_RESTRICTED'});
});

test('an invitation is not valid from PAID status alone',()=>{
  for(const patch of [
    {sybilStatus:'REVIEW'},{identityLinkStatus:'REVIEW'},
    {voteCompleted:false},{vot3Converted:false},
    {appsCompleted:2},{vot3ConversionTxId:null},
    {voteRoundId:null},{activationBlock:null},
    {appsCompletedBlock:99},{voteCompletedBlock:119},
  ]){
    const x=input({invitation:{...invitation,...patch}});
    const result=qualifyLegacyActiveMembership(x);
    assert.equal(result.eligible,false,JSON.stringify(patch));
  }
});

test('assessments must be exact, current, and from correct referral and network',()=>{
  for(const patch of [
    {inviteCode:'XYZ2345'},{network:'testnet'},
    {revision:0},{state:'ANALYSIS_PENDING'},
  ]){
    const result=qualifyLegacyActiveMembership(input({
      currentAssessment:{...assessment,...patch},
    }));
    assert.deepEqual(result,{eligible:false,reason:'CURRENT_SYBIL_NOT_CLEAR'});
  }
});

test('unbound, cross-network or wrong-wallet records fail closed',()=>{
  assert.deepEqual(qualifyLegacyActiveMembership(input({invitation:null})),
    {eligible:false,reason:'NO_COMPLETED_ONBOARDING'});
  for(const patch of [
    {status:'ACTIVATING'},{rewardStatus:'PENDING'},
    {inviteeWallet:'0x'+'c'.repeat(40)},{network:'testnet'},
  ]){
    assert.deepEqual(qualifyLegacyActiveMembership(input({
      invitation:{...invitation,...patch},
    })),{eligible:false,reason:'NO_COMPLETED_ONBOARDING'});
  }
});
