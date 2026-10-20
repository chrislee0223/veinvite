import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  calibrateHistoricalRewardCohorts,
  compareConservativeRewardShadow,
} from '../src/lib/rewards/rewardCohortShadowAudit.ts';

// Anonymized read-only Production aggregates captured 2026-10-20:
// gross paid records remain immutable after an ACTIVE post-payout invalidation.
// These seven cohorts are not independent per-payout "reward rounds".
const HISTORICAL = [
  { cohortRound: 114, daysSinceEnd: 43, activated: 11, paidGross: 3, paidInvalidated: 1, blockedBeforePayment: 1, stillActivating: 7 },
  { cohortRound: 115, daysSinceEnd: 36, activated: 20, paidGross: 14, paidInvalidated: 11, blockedBeforePayment: 0, stillActivating: 6 },
  { cohortRound: 116, daysSinceEnd: 29, activated: 22, paidGross: 17, paidInvalidated: 14, blockedBeforePayment: 2, stillActivating: 3 },
  { cohortRound: 117, daysSinceEnd: 22, activated: 59, paidGross: 2, paidInvalidated: 1, blockedBeforePayment: 53, stillActivating: 4 },
  { cohortRound: 118, daysSinceEnd: 15, activated: 10, paidGross: 0, paidInvalidated: 0, blockedBeforePayment: 8, stillActivating: 2 },
  { cohortRound: 119, daysSinceEnd: 8, activated: 10, paidGross: 3, paidInvalidated: 0, blockedBeforePayment: 6, stillActivating: 1 },
  { cohortRound: 120, daysSinceEnd: 1, activated: 14, paidGross: 5, paidInvalidated: 0, blockedBeforePayment: 5, stillActivating: 4 },
];

const BASE = {
  baselineStressRecipients: 10,
  knownOutstanding: 8,
  additionalPotentialEntrants: 0,
  availableCohortWei: '1329665271983002091520',
  physicallyAvailableWei: '7540905556489384107742',
};

test('counts actual verified referrals rather than immutable PAID rows or payout batches', () => {
  const evidence = calibrateHistoricalRewardCohorts(HISTORICAL);
  assert.equal(HISTORICAL.reduce((x, row) => x + row.paidGross, 0), 44);
  assert.equal(evidence.invalidatedAllPayouts, 27);
  assert.equal(evidence.verifiedAllPayouts, 17);
  assert.equal(evidence.matureCohorts, 4);
  assert.equal(evidence.verifiedMaturePayouts, 9);
  assert.equal(evidence.unresolvedInMatureCohorts, 20);
  assert.equal(evidence.ready, false);
  assert.equal(evidence.reason, 'TOO_FEW_MATURE_COHORTS');
  assert.equal(evidence.matureP90VerifiedRecipients, null);
});

test('does not suggest a payout increase with immature, censored production data', () => {
  const calibration = calibrateHistoricalRewardCohorts(HISTORICAL);
  const comparison = compareConservativeRewardShadow({
    calibration, ...BASE,
  });
  assert.equal(comparison.status, 'EVIDENCE_NOT_READY');
  assert.equal(comparison.proposedStressRecipients, null);
  assert.equal(comparison.proposedQuoteWei, null);
  assert.equal(comparison.baselineStressRecipients, 10);
  assert.equal(comparison.baselineQuoteWei, '132966527198300209152');
});

test('rejects duplicated cohorts, over-counted invalidations and contradictory statuses', () => {
  assert.throws(
    () => calibrateHistoricalRewardCohorts([...HISTORICAL, HISTORICAL[0]]),
    /duplicate/,
  );
  assert.throws(
    () => calibrateHistoricalRewardCohorts([{ ...HISTORICAL[0], paidInvalidated: 4 }]),
    /inconsistent/,
  );
  assert.throws(
    () => calibrateHistoricalRewardCohorts([{ ...HISTORICAL[0], stillActivating: 99 }]),
    /inconsistent/,
  );
});

function sufficientCalibration() {
  return calibrateHistoricalRewardCohorts(
    Array.from({ length: 8 }, (_, index) => ({
      cohortRound: 200 + index,
      daysSinceEnd: 30 + index,
      activated: 6,
      paidGross: 5,
      paidInvalidated: 0,
      blockedBeforePayment: 1,
      stillActivating: 0,
    })),
  );
}

test('shadow comparison is possible only with sufficient verified cohorts', () => {
  const calibration = sufficientCalibration();
  assert.equal(calibration.ready, true);
  assert.equal(calibration.verifiedMaturePayouts, 40);
  assert.equal(calibration.matureP90VerifiedRecipients, 5);
  const comparison = compareConservativeRewardShadow({
    calibration, ...BASE,
  });
  assert.equal(comparison.status, 'SHADOW_ONLY');
  assert.equal(comparison.proposedStressRecipients, 9);
  assert.equal(comparison.scenarioProtectedRecipients, 8);
  assert.equal(comparison.proposedQuoteWei, '147740585775889121280');
  assert.ok(BigInt(comparison.proposedQuoteWei) > BigInt(comparison.baselineQuoteWei));
});

test('future entrants and cohort balance caps defeat an unsafe proposed bonus', () => {
  const calibration = sufficientCalibration();
  const comparison = compareConservativeRewardShadow({
    calibration, ...BASE,
    additionalPotentialEntrants: 3,
    physicallyAvailableWei: '1000000000000000000000',
  });
  assert.equal(comparison.proposedStressRecipients, 12);
  assert.equal(comparison.scenarioProtectedRecipients, 11);
  assert.equal(comparison.pricingCapacityWei, '1000000000000000000000');
  assert.equal(comparison.proposedQuoteWei, '83333333333333333333');
  assert.ok(BigInt(comparison.proposedQuoteWei) < BigInt(comparison.baselineQuoteWei));
});

test('shadow refuses malformed financial inputs rather than silently repricing', () => {
  const calibration = sufficientCalibration();
  assert.throws(
    () => compareConservativeRewardShadow({ calibration, ...BASE, availableCohortWei: '1.5' }),
    /exact non-negative/,
  );
  assert.throws(
    () => compareConservativeRewardShadow({ calibration, ...BASE, knownOutstanding: 0 }),
    /invalid reservation cohort/,
  );
});

test('shadow module is not imported by any live reservation, forecast or payout path', async () => {
  for (const name of [
    'src/lib/rewards/rewardReservation.ts',
    'src/lib/rewards/predictivePlanning.ts',
    'src/lib/rewards/predictivePolicy.ts',
    'src/lib/rewards/rewardForecastSnapshot.ts',
    'src/lib/rewards/immediateClaimPayout.ts',
  ]) {
    const source = await readFile(new URL('../' + name, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /rewardCohortShadowAudit/);
  }
});
