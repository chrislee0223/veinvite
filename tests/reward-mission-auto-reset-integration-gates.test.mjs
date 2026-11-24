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
  assert.match(reader,/checkedBlock: Math\.min\(dappRound\.voteEndBlock, finalizedBlock\)/);
  assert.match(reader,/expectedRoundId: voteRoundId/);
  assert.match(reader,/checkedFromBlock: voteRound\.voteStartBlock/);
  assert.match(reader,/checkedThroughBlock: Math\.min\(voteRound\.voteEndBlock, finalizedBlock\)/);
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

test('authenticated invite views and network slots share the durable attempt projection', () => {
  const display = read('src/lib/rewards/missionAutoResetDisplay.ts');
  const detail = read('src/app/api/invites/[code]/route.ts');
  const list = read('src/app/api/invites/route.ts');
  const slots = read('src/app/api/network/slots/route.ts');
  const worker = read('src/lib/rewards/missionAutoResetSweep.ts');
  assert.match(display,/VEINVITE_MISSION_AUTO_RESET_READY !== 'true'/);
  assert.match(display,/read_mission_auto_reset_progress_v1/);
  assert.match(detail,/canReadDetails\s*\? \(await readMissionAttemptDisplays\(\[row\]\)\)/);
  assert.match(detail,/attemptDetailProgress\(attempt\)/);
  assert.match(list,/applyAttemptDisplay\(row, attempts.get\(row.invite_code\)\)/);
  assert.match(slots,/applyAttemptDisplay\(row, attempts.get\(row.invite_code\)\)/);
  assert.match(worker,/record_mission_auto_reset_progress_v1/);
  assert.match(worker,/p_events: proof.events/);
  assert.match(reader,/getBlockCompressed\('finalized'\)/);
});

test('legacy cron reconciliation cannot replay original mission evidence after restart',()=>{
  const sync = read('src/lib/impact/syncInvitation.ts');
  const boundary = sync.indexOf('const activeAttempt = await readActiveAttemptSync(initial);');
  const legacy = sync.indexOf('let row = { ...initial };');
  assert.ok(boundary >= 0 && legacy > boundary);
  assert.match(sync,/if \(activeAttempt\) return activeAttempt;/);
});
test('completion binds only the finalized voting-round allocation before settlement',()=>{
  const worker = read('src/lib/rewards/missionAutoResetSweep.ts');
  assert.match(worker,/bind_mission_retry_completion_v1/);
  assert.match(stagedSql,/mission_retry_settlement_bindings_v1/);
  assert.match(stagedSql,/vebetter_round_id=a\.vote_round_id-1/);
  assert.match(stagedSql,/claim_block_number<=a\.proof_finalized_through_block/);
  assert.match(stagedSql,/completion_event_id bigint NOT NULL UNIQUE/);
  assert.match(stagedSql,/PREVIOUS_ATTEMPT_PROTECTED/);
  assert.doesNotMatch(worker,/commit_reward_reservation\(|runAutomaticRewardPayout\(/);
});
