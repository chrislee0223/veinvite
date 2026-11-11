import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeElasticRewardPreview,
  selectRealisticElasticRewardWei,
} from '../src/lib/rewards/rewardForecastDisplay.ts';

const wei = 10n ** 18n;
function preview(acceptedParticipants = 1) {
  return normalizeElasticRewardPreview({
    mode: 'ELASTIC_SCENARIOS',
    oneWinnerWei: (1255n * wei).toString(),
    twoWinnersWei: (623n * wei).toString(),
    threeWinnersWei: (412n * wei).toString(),
    acceptedParticipants,
    rewardCohortRoundId: 124,
    observedAt: '2026-11-11T12:11:58Z',
  });
}

test('one accepted participant: show an additional-entrant scenario, not single-winner maximum', () => {
  assert.equal(selectRealisticElasticRewardWei({
    preview: preview(1), historicalRecipientLow: 2,
  }), (623n * wei).toString());
});

test('zero or two accepted participants use two/three recipient scenarios respectively', () => {
  assert.equal(selectRealisticElasticRewardWei({
    preview: preview(0), historicalRecipientLow: 2,
  }), (623n * wei).toString());
  assert.equal(selectRealisticElasticRewardWei({
    preview: preview(2), historicalRecipientLow: 2,
  }), (412n * wei).toString());
});

test('recent historical recipient floor can conservatively select three winners', () => {
  assert.equal(selectRealisticElasticRewardWei({
    preview: preview(1), historicalRecipientLow: 3,
  }), (412n * wei).toString());
});

test('four plausible winners or absent capacity fail closed instead of promising a larger quote', () => {
  assert.equal(selectRealisticElasticRewardWei({
    preview: preview(3), historicalRecipientLow: 2,
  }), null);
  assert.equal(selectRealisticElasticRewardWei({
    preview: preview(1), historicalRecipientLow: 4,
  }), null);
  assert.equal(selectRealisticElasticRewardWei({
    preview: normalizeElasticRewardPreview({
      ...preview(1), twoWinnersWei: '0', threeWinnersWei: '0',
    }),
    historicalRecipientLow: 2,
  }), null);
});

test('malformed, contradictory or missing elastic amounts are not shown', () => {
  assert.deepEqual(normalizeElasticRewardPreview(null), { mode: 'PENDING' });
  assert.deepEqual(normalizeElasticRewardPreview({
    ...preview(1), oneWinnerWei: '1', twoWinnersWei: '2',
  }), { mode: 'PENDING' });
  assert.deepEqual(normalizeElasticRewardPreview({
    ...preview(1), acceptedParticipants: -1,
  }), { mode: 'PENDING' });
  assert.deepEqual(normalizeElasticRewardPreview({
    ...preview(1), observedAt: 'wrong-date',
  }), { mode: 'PENDING' });
  assert.equal(selectRealisticElasticRewardWei({ preview: { mode: 'LEGACY' } }), null);
});
