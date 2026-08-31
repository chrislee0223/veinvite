import test from 'node:test';
import assert from 'node:assert/strict';

import {
  combineReferralPartySybilDecisions,
} from '../src/lib/sybil/risk.ts';

function decision({
  status = 'CLEAR',
  riskLevel = 'NONE',
  riskScore = 0,
  reason = null,
  source = 'VEPASSPORT',
} = {}) {
  return {
    status,
    riskLevel,
    riskScore,
    reason,
    source,
  };
}

test('keeps a referral clear only when both parties are clear', () => {
  const result = combineReferralPartySybilDecisions({
    inviter: decision(),
    invitee: decision(),
  });

  assert.equal(result.status, 'CLEAR');
  assert.equal(result.riskLevel, 'NONE');
  assert.equal(result.riskScore, 0);
  assert.equal(result.reason, null);
});

test('blocks payout when the inviter reward recipient is blacklisted', () => {
  const result = combineReferralPartySybilDecisions({
    inviter: decision({
      status: 'BLOCKED',
      riskLevel: 'HIGH',
      riskScore: 100,
      reason: 'VePassport reports this wallet as blacklisted.',
    }),
    invitee: decision(),
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.riskScore, 100);
  assert.match(result.reason, /^Inviter:/);
});

test('holds payout for review when the invitee reaches the signal threshold', () => {
  const result = combineReferralPartySybilDecisions({
    inviter: decision({
      status: 'CLEAR',
      riskLevel: 'LOW',
      riskScore: 20,
      reason: 'One signal remains below threshold.',
    }),
    invitee: decision({
      status: 'REVIEW',
      riskLevel: 'HIGH',
      riskScore: 80,
      reason: 'Signal threshold reached.',
    }),
  });

  assert.equal(result.status, 'REVIEW');
  assert.equal(result.riskScore, 80);
  assert.match(result.reason, /^Invitee:/);
});

test('blocked outranks review regardless of the lower numeric score', () => {
  const result = combineReferralPartySybilDecisions({
    inviter: decision({
      status: 'REVIEW',
      riskLevel: 'HIGH',
      riskScore: 99,
      reason: 'Needs review.',
    }),
    invitee: decision({
      status: 'BLOCKED',
      riskLevel: 'HIGH',
      riskScore: 70,
      reason: 'Confirmed block.',
    }),
  });

  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason, /^Invitee:/);
});

test('preserves the stronger low-risk clear signal for audit visibility', () => {
  const result = combineReferralPartySybilDecisions({
    inviter: decision({
      status: 'CLEAR',
      riskLevel: 'LOW',
      riskScore: 20,
      reason: 'One signal remains below threshold.',
    }),
    invitee: decision(),
  });

  assert.equal(result.status, 'CLEAR');
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.riskScore, 20);
  assert.match(result.reason, /^Inviter:/);
});
