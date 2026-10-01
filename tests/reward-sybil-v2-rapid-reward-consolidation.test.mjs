import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectRapidRewardConsolidation,
} from '../src/lib/sybil/v2/rapidRewardConsolidation.ts';
import {
  evaluateSybilV2Policy,
} from '../src/lib/sybil/v2/policy.ts';

const HUB = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROTOCOL = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function iso(day, secondOffset = 0) {
  return new Date(
    Date.UTC(2025, 0, day, 12, 0, secondOffset),
  ).toISOString();
}

const rewards = [1, 3, 5, 7, 9, 11].map((day) => ({
  blockTimestamp: iso(day),
  amountWei: '10000000000000000000',
}));

test('repeated rapid reward consolidation becomes HIGH historical HOLD evidence', () => {
  const outflows = [1, 3, 5, 7, 9, 11].map((day) => ({
    destinationWallet: HUB,
    blockTimestamp: iso(day, 75),
    amountWei: '9500000000000000000',
  }));

  const finding = detectRapidRewardConsolidation({
    rewards,
    outflows,
    knownProtocolDestinations: new Set(),
  });

  assert.ok(finding);
  assert.equal(
    finding.signal.code,
    'HISTORICAL_RAPID_REWARD_CONSOLIDATION',
  );
  assert.equal(finding.signal.strength, 'HIGH');
  assert.equal(finding.rapidRewardEventCount, 6);
  assert.ok(finding.rapidRewardShareBps >= 7_500);
  assert.ok(finding.outflowCoverageBps >= 8_000);
  assert.equal(finding.dominantDestination, HUB);
  assert.ok(finding.dominantDestinationShareBps >= 6_000);

  const policy = evaluateSybilV2Policy({
    signals: [finding.signal],
    requiredChecksComplete: false,
  });

  assert.equal(policy.state, 'HOLD');
});

test('a late one-off sweep does not match the rapid repeated pattern', () => {
  const finding = detectRapidRewardConsolidation({
    rewards,
    outflows: [{
      destinationWallet: HUB,
      blockTimestamp: new Date(
        Date.UTC(2025, 0, 12, 12, 0, 0),
      ).toISOString(),
      amountWei: '57000000000000000000',
    }],
    knownProtocolDestinations: new Set(),
  });

  assert.equal(finding, null);
});

test('protocol destinations are excluded from reward-consolidation suspicion', () => {
  const outflows = [1, 3, 5, 7, 9, 11].map((day) => ({
    destinationWallet: PROTOCOL,
    blockTimestamp: iso(day, 60),
    amountWei: '9500000000000000000',
  }));

  const finding = detectRapidRewardConsolidation({
    rewards,
    outflows,
    knownProtocolDestinations: new Set([PROTOCOL]),
  });

  assert.equal(finding, null);
});
