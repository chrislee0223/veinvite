import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=(p)=>readFileSync(p,'utf8');
const worker=src('src/lib/rewards/missionAutoResetSweep.ts');
const voteCron=src('src/app/api/cron/vote-reconcile/route.ts');
const migration=src('docs/staged-sql/20261124_mission_auto_reset_staged_disabled_v1.sql');
const ack=src('docs/staged-sql/20261124_mission_reset_invitee_ack_v1.sql');
const runtimeConfig=src('vercel.json');

test('new work cannot start from a user click or a single Production flag',()=>{
  assert.match(worker,/VEINVITE_MISSION_AUTO_RESET_READY !== 'true'/);
  assert.match(worker,/read_mission_auto_reset_settings_v1/);
  assert.match(worker,/if \(!settings\.enabled\)/);
  assert.match(worker,/try_acquire_operator_lock/);
  assert.match(worker,/invite_evidence_sync:/);
  assert.match(worker,/verifyPreviousMissionVoteWindow/);
  assert.match(worker,/absence\.outcome !== 'SAFE_TO_RESET'/);
  assert.match(worker,/deriveMissionAutoReset/);
  assert.match(worker,/commit_invitation_mission_auto_reset_v1/);
  assert.match(worker,/finally \{/);
  assert.doesNotMatch(worker,/commit_reward_reservation|runAutomaticRewardPayout/);
});

test('worker reuses existing five-minute cadence without another Vercel cron',()=>{
  assert.match(voteCron,/runMissionAutoResetSweepSafe/);
  assert.match(voteCron,/const reset = await runMissionAutoResetSweepSafe\(\)/);
  assert.match(voteCron,/missionAutoReset = reset\.sweep/);
  assert.doesNotMatch(runtimeConfig,/mission-auto-reset/);
});

test('attempt records and exact-once notice stay service-only, disabled and financially isolated',()=>{
  assert.match(migration,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(migration,/TO service_role/);
  assert.match(migration,/CREATE TRIGGER zz_guard_legacy_mission_auto_reset_promotion_v1/);
  assert.match(migration,/MISSION_RETRY_CANONICAL_PAYOUT_NOT_ENABLED/);
  assert.match(migration,/CREATE TRIGGER mission_attempt_event_insert_validator_v1/);
  assert.match(migration,/MISSION_ATTEMPT_EVENTS_IMMUTABLE/);
  assert.match(migration,/recipient_wallet,dedupe_key/);
  assert.doesNotMatch(migration,/UPDATE public\.invitations SET apps_completed\s*=\s*0/i);
  assert.doesNotMatch(migration,/UPDATE public\.reward_queue_entries/i);
  assert.doesNotMatch(migration,/UPDATE public\.reward_payouts/i);
});

test('reading the invitee reset notice must never advance the inviter milestone',()=>{
  assert.match(ack,/and v_row\.kind <> 'MISSION_PROGRESS_RESET' then/);
  assert.match(ack,/INVITE_NOTIFICATION_ACK_VERSION_REVIEW_REQUIRED/);
  assert.match(ack,/insert into public\.invite_notification_history_reads/);
});
