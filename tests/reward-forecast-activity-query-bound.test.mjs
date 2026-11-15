import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeUnsettledPoolReferrals } from '../src/lib/rewards/activeSharedPoolForecast.ts';

const api=readFileSync('src/app/api/rewards/estimate/route.ts','utf8');
const row=(overrides={})=>({
  status:'ACTIVATING',sybil_status:'NOT_CHECKED',reward_status:'PENDING',
  apps_completed:0,ineligible_at:null,...overrides,
});

test('old pending referrals are never excluded solely due to age or unfinished progress',()=>{
  const pool=[
    row({apps_completed:0}),row({apps_completed:1}),row({apps_completed:3}),
    row({status:'COMPLETED',reward_status:'ELIGIBLE',sybil_status:'CLEAR'}),
    row({status:'CANCELLED'}),row({reward_status:'FORFEITED'}),
  ];
  assert.deepEqual(summarizeUnsettledPoolReferrals(pool),{
    possibleRecipients:4,missionProgressParticipants:2,eligibleCompletedRecipients:1,
  });
  assert.doesNotMatch(api,/ACTIVE_WINDOW_MS|cutoffIso|activityFilter|boundedFilter/);
});

test('one bounded read-only query covers all unsettled possible recipients',()=>{
  assert.match(api,/\.from\('invitations'\)/);
  assert.match(api,/\.eq\('activation_network', network\)/);
  assert.match(api,/\.in\('status', \['ACTIVATING', 'COMPLETED'\]\)/);
  assert.match(api,/\.in\('reward_status', \['PENDING', 'ELIGIBLE'\]\)/);
  assert.match(api,/\.limit\(1000\)/);
  assert.match(api,/unsettledRows\.length === 1000/);
  assert.match(api,/apps_completed,ineligible_at/);
  assert.doesNotMatch(api,/commit_reward_reservation\(|commit_reward_shared_pool_v1\(/);
});
