import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  summarizeUnsettledPoolReferrals,
  estimateUnsettledRewardScenarios,
} from '../src/lib/rewards/activeSharedPoolForecast.ts';

const W=10n**18n;
const pending=(overrides={})=>({
  status:'ACTIVATING',sybil_status:'NOT_CHECKED',reward_status:'PENDING',
  apps_completed:0,ineligible_at:null,...overrides,
});

test('past and current, idle and progressing pending invites all remain possible recipients',()=>{
  assert.deepEqual(summarizeUnsettledPoolReferrals([
    pending({apps_completed:3}),pending({apps_completed:1}),pending({apps_completed:0}),
    pending({status:'COMPLETED',reward_status:'ELIGIBLE',sybil_status:'CLEAR'}),
  ]),{possibleRecipients:4,missionProgressParticipants:2,eligibleCompletedRecipients:1});
});

test('do not count blocked, forfeited, paid, cancelled or ineligible users',()=>{
  assert.deepEqual(summarizeUnsettledPoolReferrals([
    pending({sybil_status:'BLOCKED'}),pending({reward_status:'FORFEITED'}),
    pending({status:'COMPLETED',reward_status:'PAID'}),pending({status:'CANCELLED'}),
    pending({ineligible_at:'2026-11-01T00:00:00Z'}),
    pending({status:'COMPLETED',reward_status:'ELIGIBLE',sybil_status:'CLEAR'}),
  ]),{possibleRecipients:1,missionProgressParticipants:0,eligibleCompletedRecipients:1});
});

test('current-pool scenario endpoints never treat unfinished people as paid',()=>{
  const one=7400n*W,x=10n*W;
  for(const possible of [0,1,2,3,25,999]){
    const s=estimateUnsettledRewardScenarios(one.toString(),x.toString(),possible);
    const n=BigInt(Math.max(1,possible));
    assert.equal(s.scenarioMaxRecipients,Number(n));
    const left=one+x-n*x;
    assert.equal(BigInt(s.scenarioLowWei),left>0n?left/n:0n);
    assert.equal(s.scenarioHighWei,one.toString());
  }
  assert.equal(estimateUnsettledRewardScenarios('0','10',25).scenarioLowWei,'0');
  assert.equal(estimateUnsettledRewardScenarios('100','1000',5).scenarioLowWei,'0');
  assert.throws(()=>estimateUnsettledRewardScenarios('-1','0',5));
  assert.throws(()=>estimateUnsettledRewardScenarios('1','-10',5));
  assert.throws(()=>estimateUnsettledRewardScenarios('1','10',1000));
});

test('preview cannot change canonical reservation, Claim or Sybil behavior',()=>{
  const api=readFileSync('src/app/api/rewards/estimate/route.ts','utf8');
  const card=readFileSync('src/components/PublicRewardForecastCard.tsx','utf8');
  const writer=readFileSync('src/lib/rewards/rewardReservation.ts','utf8');
  assert.match(api,/summarizeUnsettledPoolReferrals/);
  assert.match(api,/estimateUnsettledRewardScenarios/);
  assert.match(api,/scenarioLowWei: scenarios\.scenarioLowWei/);
  assert.match(api,/scenarioHighWei: scenarios\.scenarioHighWei/);
  assert.match(card,/formatRewardWei\(elastic\.scenarioLowWei\)/);
  assert.match(card,/formatRewardWei\(elastic\.scenarioHighWei\)/);
  assert.doesNotMatch(card,/formatRewardWei\(elastic\.oneWinnerWei\)/);
  assert.match(writer,/commit_reward_shared_pool_v1/);
  assert.doesNotMatch(api,/commit_reward_shared_pool_v1/);
});
