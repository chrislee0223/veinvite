import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyMissionWindow as classify } from '../src/lib/rewards/missionWindowPolicy.ts';

const base = {
  rolloutStartRoundId: 126,
  missionStartRoundId: 126,
  currentRoundId: 126,
  invitationStatus: 'ACTIVATING',
  rewardStatus: 'PENDING',
  sybilStatus: 'NOT_CHECKED',
  voteCompleted: false,
  hasDurableReservation: false,
};

test('a new attempt collects dApps in its own round and votes in the next round', () => {
  assert.deepEqual(classify(base), {
    state: 'COLLECT_DAPPS', targetVoteRoundId: 127, restartRequired: false,
  });
  assert.equal(classify({ ...base, currentRoundId: 127 }).state, 'VOTE_WINDOW');
  assert.equal(classify({ ...base, currentRoundId: 128 }).state, 'MISSED_VOTE_RESTART_REQUIRED');
  assert.equal(classify({ ...base, currentRoundId: 128 }).restartRequired, true);
  assert.equal(classify({ ...base, currentRoundId: 180 }).restartRequired, true);
});

test('completed and paid referrals are never expired, including the two existing 125 completions', () => {
  for (const status of ['COMPLETED', 'ACTIVATING']) {
    const x = classify({ ...base, missionStartRoundId: 124, currentRoundId: 180,
      invitationStatus: status, rewardStatus: 'ELIGIBLE' });
    assert.equal(x.state, 'COMPLETION_PROTECTED');
  }
  assert.equal(classify({ ...base, currentRoundId: 130,
    rewardStatus: 'PAID' }).state, 'REWARD_PROTECTED');
  assert.equal(classify({ ...base, currentRoundId: 130,
    hasDurableReservation: true }).state, 'REWARD_PROTECTED');
});

test('a pending onchain vote proof or security review must never be cleared by timeout', () => {
  assert.equal(classify({ ...base, currentRoundId: 130,
    voteCompleted: true }).state, 'VOTE_PROOF_PENDING');
  assert.equal(classify({ ...base, currentRoundId: 130,
    sybilStatus: 'REVIEW' }).state, 'SECURITY_REVIEW');
});

test('old invitations are read-only legacy until attempt-aware migration exists', () => {
  assert.equal(classify({ ...base, missionStartRoundId: 124, currentRoundId: 130 }).state,
    'LEGACY');
  assert.equal(classify({ ...base, missionStartRoundId: null, currentRoundId: 130 }).state,
    'LEGACY');
  assert.equal(classify({ ...base, invitationStatus: 'PENDING_ACCEPTANCE' }).state,
    'WAITING_FOR_ACCEPTANCE');
  assert.equal(classify({ ...base, invitationStatus: 'CANCELLED' }).state,
    'TERMINAL');
  assert.equal(classify({ ...base, sybilStatus: 'BLOCKED' }).state, 'TERMINAL');
});

test('invalid or unproven round positions fail closed rather than auto-expire', () => {
  for (const value of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(classify({ ...base, currentRoundId: value }).state, 'INVALID');
    assert.equal(classify({ ...base, missionStartRoundId: value }).state, 'INVALID');
  }
  assert.equal(classify({ ...base, missionStartRoundId: 129,
    currentRoundId: 128 }).state, 'INVALID');
});
