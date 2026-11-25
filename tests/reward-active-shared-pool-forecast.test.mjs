import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  countActiveSharedPoolReferrals,
  estimateActiveSharedPoolReward,
  estimatePolicyAwareActiveSharedPoolReward,
} from '../src/lib/rewards/activeSharedPoolForecast.ts';

const W = 10n ** 18n;
const NOW = Date.parse('2026-11-12T13:30:00.000Z');
const recent = '2026-11-11T13:30:00.000Z';
const old = '2026-10-01T13:30:00.000Z';
function row(overrides = {}) {
  return {
    status: 'ACTIVATING', sybil_status: 'NOT_CHECKED',
    reward_status: 'PENDING', ineligible_at: null, apps_completed: 1, activated_at: recent,
    apps_completed_at: null, vote_completed_at: null,
    vote_round_id: null, slot_released_at: null, ...overrides,
  };
}

test('one recently accepted invite produces a one-winner scenario without inventing a newcomer', () => {
  const active = countActiveSharedPoolReferrals([row()], 124, NOW);
  assert.equal(active, 1);
  const one = 7400n * W;
  const quote = estimateActiveSharedPoolReward(one.toString(), (10n * W).toString(), active);
  assert.equal(quote.estimatedRewardWei, one.toString());
  assert.equal(quote.projectedRecipients, 1);
});

test('only actually active users share capacity without double-counting X', () => {
  const one = 7392n * W;
  const reserve = 10n * W;
  for (const active of [0, 1, 2, 3, 9]) {
    const { estimatedRewardWei, projectedRecipients } =
      estimateActiveSharedPoolReward(one.toString(), reserve.toString(), active);
    assert.equal(projectedRecipients, Math.max(1, active));
    const count = BigInt(projectedRecipients);
    assert.equal(BigInt(estimatedRewardWei), (one + reserve - count * reserve) / count);
  }
});

test('recent accepted but idle users count; old, blocked, forfeited and already paid do not', () => {
  const refs = [
    row({apps_completed: 0}),
    row({activated_at: old}),
    row({sybil_status: 'BLOCKED'}),
    row({status:'CANCELLED'}),
    row({status:'COMPLETED',vote_round_id:124,reward_status:'PAID'}),
    row({reward_status:'FORFEITED'}),
    row({ineligible_at: recent}),
    row({activated_at: old, apps_completed_at: recent, vote_round_id: null}),
    row({status:'COMPLETED',activated_at: old, vote_round_id:124,reward_status:'ELIGIBLE'}),
    row({status:'COMPLETED',activated_at: recent,vote_round_id:123}),
  ];
  assert.equal(countActiveSharedPoolReferrals(refs,124,NOW),2);
});

test('two real acceptances include a 0-mission user; a third joiner immediately updates the estimate', () => {
  const one = (7402867712268098494020n).toString();
  const x = (10n * W).toString();
  const accepted = [row({apps_completed:3}), row({apps_completed:0})];
  const two = countActiveSharedPoolReferrals(accepted,124,NOW);
  assert.equal(two, 2);
  assert.equal(estimateActiveSharedPoolReward(one,x,two).projectedRecipients,2);
  assert.equal(estimateActiveSharedPoolReward(one,x,two).estimatedRewardWei,'3696433856134049247010');
  accepted.push(row({apps_completed:0}));
  const three = countActiveSharedPoolReferrals(accepted,124,NOW);
  assert.equal(three,3);
  assert.equal(estimateActiveSharedPoolReward(one,x,three).estimatedRewardWei,'2460955904089366164673');
});

test('both pending and completed ineligible referrals are never counted', () => {
  const current = [row(), row({apps_completed:0,ineligible_at:recent}),
    row({status:'COMPLETED',reward_status:'ELIGIBLE',vote_round_id:124,ineligible_at:recent}),
    row({status:'COMPLETED',reward_status:'ELIGIBLE',vote_round_id:124})];
  assert.equal(countActiveSharedPoolReferrals(current,124,NOW),2);
});

test('previous invitation cohort may still complete this settlement round', () => {
  assert.equal(countActiveSharedPoolReferrals(
    [row({status:'COMPLETED',activated_at:old,vote_round_id:124,reward_status:'ELIGIBLE'})],
    124, NOW), 1);
});

test('bounded, fail-closed quote arithmetic never creates negative rewards', () => {
  assert.equal(estimateActiveSharedPoolReward('100', '1000', 5).estimatedRewardWei, '0');
  assert.equal(estimateActiveSharedPoolReward('0','1000',5).estimatedRewardWei,'0');
  assert.throws(() => estimateActiveSharedPoolReward('-1','0',0));
  assert.throws(() => estimateActiveSharedPoolReward('1','10',1000));
  assert.throws(() => countActiveSharedPoolReferrals([],0,NOW));
});

test('public API and home UI use a single participation-aware value and preserve payout separation', () => {
  const api=readFileSync('src/app/api/rewards/estimate/route.ts','utf8');
  const reader=readFileSync('src/lib/rewards/publicElasticForecastReader.ts','utf8');
  const card=readFileSync('src/components/PublicRewardForecastCard.tsx','utf8');
  const writer=readFileSync('src/lib/rewards/rewardReservation.ts','utf8');
  assert.match(api,/readElasticPublicPreview/);
  assert.match(reader,/estimateActiveSharedPoolReward/);
  assert.match(api, /estimatedRewardWei: publicEstimateWei/);
  assert.doesNotMatch(api, /estimatedRewardWei: snapshot\.estimatedRewardWei/);
  assert.match(reader,/countActiveSharedPoolReferrals/);
  assert.match(card,/formatRewardWei\(elastic\.displayEstimateWei\)/);
  assert.doesNotMatch(card,/formatRewardWei\(elastic\.oneWinnerWei\)/);
  assert.match(writer,/commit_reward_shared_pool_v1/);
  assert.doesNotMatch(api,/commit_reward_shared_pool_v1/);
});

test('policy-aware forecast protects legacy only and never deducts old X reserve for new invitations', () => {
  const cutover = '2026-11-10T00:00:00Z';
  const legacy = row({created_at:'2026-11-09T00:00:00Z'});
  const newer = row({created_at:'2026-11-11T00:00:00Z'});
  const reserve = (10n*W).toString();
  const cap = (1000n*W).toString();
  const forecast = (rows, sunset=null) => estimatePolicyAwareActiveSharedPoolReward(
    cap,reserve,rows,124,NOW,cutover,sunset);
  assert.equal(forecast([]).estimatedRewardWei,cap);
  assert.equal(forecast([newer]).estimatedRewardWei,cap);
  assert.equal(forecast([legacy]).estimatedRewardWei,(990n*W).toString());
  assert.equal(forecast([legacy,newer]).estimatedRewardWei,(495n*W).toString());
  assert.equal(forecast([newer,newer]).estimatedRewardWei,(500n*W).toString());
  assert.equal(forecast([legacy,legacy]).estimatedRewardWei,(490n*W).toString());
  assert.equal(forecast([newer],'2026-11-10T12:00:00Z').estimatedRewardWei,(990n*W).toString());
  assert.equal(forecast([legacy,row({created_at:null,status:'CANCELLED'})]).estimatedRewardWei,(990n*W).toString());
  assert.throws(()=>forecast([row({created_at:null})]));
  assert.equal(estimatePolicyAwareActiveSharedPoolReward('1',reserve,[newer],124,NOW,cutover,null).estimatedRewardWei,'1');
});

test('fixed but unclaimed rewards and fully offset settlements do not divide free pool again', () => {
  const cutover = '2026-11-10T00:00:00Z';
  const open = row({created_at:'2026-11-11T00:00:00Z',apps_completed:0});
  const completed = row({created_at:'2026-11-09T00:00:00Z',status:'COMPLETED',
    vote_round_id:124,reward_status:'ELIGIBLE'});
  const fixed = {...completed,slot_released_at:recent};
  const fullyOffset = {...completed,slot_released_at:recent,reward_status:'PENDING'};
  const paid = {...fixed,reward_status:'PAID'};
  const forecast = rows => estimatePolicyAwareActiveSharedPoolReward(
    (500n*W).toString(),(10n*W).toString(),rows,124,NOW,cutover,null);
  assert.equal(countActiveSharedPoolReferrals([open,completed],124,NOW),2);
  for (const settled of [fixed,fullyOffset,paid]) {
    assert.equal(countActiveSharedPoolReferrals([open,settled],124,NOW),1);
    assert.equal(forecast([open,settled]).estimatedRewardWei,(500n*W).toString());
    assert.equal(forecast([settled]).projectedRecipients,1);
  }
  assert.equal(forecast([open,completed]).estimatedRewardWei,(245n*W).toString());
  assert.equal(countActiveSharedPoolReferrals([row({slot_released_at:recent})],124,NOW),0);
});

test('fixed recipients are excluded in the existing single read and forecast cache is versioned', () => {
  const reader = readFileSync('src/lib/rewards/publicElasticForecastReader.ts','utf8');
  const firstPaint = readFileSync('src/lib/rewards/publicRewardForecastFirstPaint.ts','utf8');
  assert.match(reader,/\.is\('slot_released_at', null\)/);
  assert.match(reader,/vote_round_id,slot_released_at/);
  assert.match(firstPaint,/\['public-current-shared-pool-first-paint-v1', PUBLIC_ACTIVE_FORECAST_MODEL_VERSION\]/);
  assert.doesNotMatch(reader,/\.from\('reward_queue_entries'\)|\.from\('reward_recovery_settlements'\)/);
});

test('only active retry evidence adds an older participant; dormant reset and fixed slot do not', () => {
  const dormant = row({activated_at:old,apps_completed:0,retry_active:false});
  const working = {...dormant,apps_completed:1,retry_active:true};
  assert.equal(countActiveSharedPoolReferrals([dormant],124,NOW),0);
  assert.equal(countActiveSharedPoolReferrals([working],124,NOW),1);
  assert.equal(countActiveSharedPoolReferrals([{...working,slot_released_at:recent}],124,NOW),0);
  assert.equal(countActiveSharedPoolReferrals([{...working,status:'UNDER_REVIEW'}],124,NOW),0);
});
