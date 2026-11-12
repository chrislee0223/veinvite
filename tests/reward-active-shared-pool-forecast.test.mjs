import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  countActiveSharedPoolReferrals,
  estimateProspectiveSharedPoolReward,
} from '../src/lib/rewards/activeSharedPoolForecast.ts';

const W = 10n ** 18n;
const NOW = Date.parse('2026-11-12T13:30:00.000Z');
const recent = '2026-11-11T13:30:00.000Z';
const old = '2026-10-01T13:30:00.000Z';
function row(overrides = {}) {
  return {
    status: 'ACTIVATING', sybil_status: 'NOT_CHECKED',
    reward_status: 'PENDING', activated_at: recent,
    apps_completed_at: null, vote_completed_at: null,
    vote_round_id: null, ...overrides,
  };
}

test('new invite is included; one existing user means two possible recipients', () => {
  const active = countActiveSharedPoolReferrals([row()], 124, NOW);
  assert.equal(active, 1);
  const one = 7400n * W;
  const quote = estimateProspectiveSharedPoolReward(one.toString(), (10n * W).toString(), active);
  // 7,400 is the 1-winner amount AFTER its own X reserve. Two winners need 2 X reserves.
  assert.equal(quote.estimatedRewardWei, ((one - 10n * W) / 2n).toString());
  assert.equal(quote.projectedRecipients, 2);
});

test('one, two, three, four competitors share available capacity without double-counting X', () => {
  const one = 7392n * W;
  const reserve = 10n * W;
  for (const active of [0, 1, 2, 3, 9]) {
    const { estimatedRewardWei, projectedRecipients } =
      estimateProspectiveSharedPoolReward(one.toString(), reserve.toString(), active);
    assert.equal(projectedRecipients, active + 1);
    const count = BigInt(projectedRecipients);
    assert.equal(BigInt(estimatedRewardWei), (one + reserve - count * reserve) / count);
  }
});

test('dormant, blocked, forfeited and already paid users do not dilute estimate', () => {
  const refs = [
    row({activated_at: old}),
    row({sybil_status: 'BLOCKED'}),
    row({status:'CANCELLED'}),
    row({status:'COMPLETED',vote_round_id:124,reward_status:'PAID'}),
    row({reward_status:'FORFEITED'}),
    row({activated_at: old, apps_completed_at: recent, vote_round_id: null}),
    row({status:'COMPLETED',activated_at: old, vote_round_id:124, reward_status:'ELIGIBLE'}),
    row({status:'COMPLETED',activated_at: recent, vote_round_id:123}),
  ];
  assert.equal(countActiveSharedPoolReferrals(refs,124,NOW),2);
});

test('previous invitation cohort may still complete this settlement round', () => {
  assert.equal(countActiveSharedPoolReferrals(
    [row({status:'COMPLETED',activated_at:old,vote_round_id:124,reward_status:'ELIGIBLE'})],
    124, NOW), 1);
});

test('bounded, fail-closed quote arithmetic never creates negative rewards', () => {
  assert.equal(estimateProspectiveSharedPoolReward('100', '1000', 5).estimatedRewardWei, '0');
  assert.equal(estimateProspectiveSharedPoolReward('0','1000',5).estimatedRewardWei,'0');
  assert.throws(() => estimateProspectiveSharedPoolReward('-1','0',0));
  assert.throws(() => estimateProspectiveSharedPoolReward('1','10',1000));
  assert.throws(() => countActiveSharedPoolReferrals([],0,NOW));
});

test('public API and home UI use a single participation-aware value and preserve payout separation', () => {
  const api=readFileSync('src/app/api/rewards/estimate/route.ts','utf8');
  const card=readFileSync('src/components/PublicRewardForecastCard.tsx','utf8');
  const writer=readFileSync('src/lib/rewards/rewardReservation.ts','utf8');
  assert.match(api,/estimateProspectiveSharedPoolReward/);
  assert.match(api,/countActiveSharedPoolReferrals/);
  assert.match(card,/formatRewardWei\(elastic\.displayEstimateWei\)/);
  assert.doesNotMatch(card,/formatRewardWei\(elastic\.oneWinnerWei\)/);
  assert.match(writer,/commit_reward_shared_pool_v1/);
  assert.doesNotMatch(api,/commit_reward_shared_pool_v1/);
});
