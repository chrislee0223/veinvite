import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const activity = read('src/lib/vebetter/activity.ts');
const voting = read('src/lib/vebetter/vote.ts');
const reader = read('src/lib/rewards/missionAutoResetChainReader.ts');
const stagedSql = read('docs/staged-sql/20261124_mission_auto_reset_staged_disabled_v1.sql');
const history = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const surface = read('src/components/InviteNotificationSurfaceV2.tsx');
const policy = read('src/lib/notifications/notificationPolicy.ts');
const groups = read('src/lib/notifications/notificationPresentationGroups.ts');

test('attempt scanner only reads exact N dApp events and N+1 voting events', () => {
  assert.match(activity,/checkedBlock\?: number/);
  assert.match(activity,/to: scanEndBlock/);
  assert.match(reader,/checkedBlock: dappRound\.voteEndBlock/);
  assert.match(reader,/expectedRoundId: voteRoundId/);
  assert.match(reader,/checkedFromBlock: voteRound\.voteStartBlock/);
  assert.match(reader,/checkedThroughBlock: voteRound\.voteEndBlock/);
  assert.match(reader,/verifyMissionAttemptProof\(/);
  assert.match(voting,/if \(expectedRoundId !== undefined && roundId !== expectedRoundId\)/);
  assert.doesNotMatch(reader,/commit_reward_shared_pool_v1|\.update\(|\.insert\(/);
});

test('one reset notice uses current bell, existing presentation and all locale copy', () => {
  for(const src of [history,surface]){
    assert.match(src,/MISSION_PROGRESS_RESET/);
    assert.match(src,/MISSION_RESET_NOTIFICATION_COPY/);
  }
  assert.match(policy,/MISSION_PROGRESS_RESET: HISTORY_TAP/);
  assert.match(groups,/MISSION_PROGRESS_RESET: 'FRIEND_PROGRESS'/);
  assert.match(surface,/data-notification-icon="dapp-progress"/);
});

test('auto-reset SQL is disabled and cannot overwrite any invitation or financial record',()=>{
  assert.match(stagedSql,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(stagedSql,/VALUES \(1, false, 126, 12\)/);
  assert.match(stagedSql,/IF NOT FOUND OR NOT v_cfg\.enabled THEN/);
  assert.match(stagedSql,/ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.match(stagedSql,/recipient_wallet,?dedupe_key/);
  assert.match(stagedSql,/grant execute on function public\.commit_invitation_mission_auto_reset_v1\(/i);
  assert.doesNotMatch(stagedSql,/update public\.invitations/i);
  assert.doesNotMatch(stagedSql,/update public\.reward_queue_entries/i);
  assert.doesNotMatch(stagedSql,/update public\.reward_payouts/i);
  assert.doesNotMatch(stagedSql,/update reward_admission_bridge\.shared_pool_settings/i);
});
