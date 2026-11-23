import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deriveMissionAutoReset as decide,
  qualifiesForAttemptDapp as counts,
} from '../src/lib/rewards/missionAutoResetPolicy.ts';

const base = {
  originalDappRoundId: 124,
  latestAttemptDappRoundId: null,
  currentRoundId: 126,
  invitationStatus: 'ACTIVATING',
  rewardStatus: 'PENDING',
  sybilStatus: 'NOT_CHECKED',
  ineligibleAt: null,
  voteCompleted: false,
  voteProofPending: false,
  hasDurableReservation: false,
  hasOutstandingHeldFunds: false,
  hasVerifiedEntryProof: true,
  targetRoundStartBlock: 1000,
  targetRoundEndBlock: 1999,
  finalizedBestBlock: 1100,
};

test('Belgian case: N=124, N+1=125, automatic N+2=126 (no manual restart)', () => {
  assert.equal(decide({...base, currentRoundId: 124}).state, 'ORIGINAL_WINDOW');
  assert.equal(decide({...base, currentRoundId: 125}).state, 'ORIGINAL_WINDOW');
  const reset = decide(base);
  assert.equal(reset.state, 'START_NEW_ATTEMPT');
  assert.equal(reset.targetDappRoundId, 126);
  assert.equal(reset.targetVoteRoundId, 127);
  assert.equal(reset.eligibleDappStartBlock, 1000);
  assert.equal(reset.notifyOnlyAfterCommit, true);
  assert.equal(counts(999, reset), false);
  assert.equal(counts(1000, reset), true);
  assert.equal(counts(1999, reset), true);
  assert.equal(counts(2000, reset), false);
});

test('delayed workers choose original N+2 round in N+3, not visit time', () => {
  const retry = decide({...base, currentRoundId: 127, finalizedBestBlock: 2100});
  assert.equal(retry.targetDappRoundId, 126);
  assert.equal(retry.targetVoteRoundId, 127);
  assert.equal(retry.eligibleDappStartBlock, 1000);
  assert.equal(decide({...base, currentRoundId: 128, latestAttemptDappRoundId:126}).targetDappRoundId,128);
});

test('exactly-once committed attempt never generates a duplicate notice', () => {
  const existing = decide({...base, latestAttemptDappRoundId:126});
  assert.equal(existing.state, 'ACTIVE_ATTEMPT');
  assert.equal(existing.notifyOnlyAfterCommit, false);
  assert.equal(counts(1100, existing), true);
});

test('confirmed/pending vote, eligibility, paid, reserved, and blocked referrals cannot reset', () => {
  for (const override of [
    {voteCompleted:true},
    {voteProofPending:true},
    {rewardStatus:'ELIGIBLE'},
    {rewardStatus:'PAID'},
    {invitationStatus:'COMPLETED'},
    {hasDurableReservation:true},
    {sybilStatus:'REVIEW'},
    {sybilStatus:'BLOCKED'},
    {ineligibleAt:'2026-11-21T00:00:00Z'},
    {hasOutstandingHeldFunds:true},
  ]) {
    const d = decide({...base, ...override});
    assert.equal(d.notifyOnlyAfterCommit,false,JSON.stringify(override));
    assert.notEqual(d.state,'START_NEW_ATTEMPT',JSON.stringify(override));
  }
});

test('old invitations without entry proof and unverifiable boundaries fail closed', () => {
  assert.equal(decide({...base, originalDappRoundId:null}).state,'LEGACY_REVIEW');
  assert.equal(decide({...base, hasVerifiedEntryProof:false}).state,'LEGACY_REVIEW');
  for (const override of [
    {targetRoundStartBlock:null}, {targetRoundEndBlock:null},
    {targetRoundEndBlock:999}, {finalizedBestBlock:999},
    {finalizedBestBlock:null},
  ]) {
    assert.equal(decide({...base,...override}).state,'ROUND_PROOF_UNAVAILABLE');
  }
  assert.equal(decide({...base,latestAttemptDappRoundId:125}).state,'INVALID');
  assert.equal(decide({...base,currentRoundId:123}).state,'INVALID');
});

test('new attempt counting does not mutate or release the original friend slot', () => {
  const d = decide(base);
  assert.equal(d.state,'START_NEW_ATTEMPT');
  assert.equal(Object.hasOwn(d,'slotReleasedAt'),false);
  assert.equal(Object.hasOwn(d,'rewardAmountWei'),false);
  assert.equal(Object.hasOwn(d,'appsCompleted'),false);
});
