import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync('docs/staged-sql/mission_legacy_reset_preflight.sql','utf8').replace(/^--.*$/gm,'');
const worker=readFileSync('src/lib/rewards/missionAutoResetSweep.ts','utf8');
test('legacy audit is read-only and distinguishes protected history, missing entry, and round mismatch',()=>{
  assert.doesNotMatch(sql,/\b(?:insert|update|delete|alter|drop|truncate|grant|revoke)\b/i);
  for(const reason of ['PROTECTED_HISTORY_REVIEW','ENTRY_PROOF_REVIEW','MISSION_FUNDING_ROUND_MISMATCH','ROUND_EVIDENCE_CONFLICT']) assert.ok(sql.includes(reason));
  assert.match(sql,/slot_released_at IS NOT NULL/);
  assert.match(sql,/s\.network=c\.activation_network/);
  assert.match(sql,/actual_round<>reward_cohort_round_id/);
  assert.match(sql,/NOT EXISTS\(SELECT 1 FROM reward_admission_bridge\.mission_retry_attempts_v1/);
});
test('diagnostics leave atomic and prior-window guards in place',()=>{
  assert.match(worker,/Mission reset atomic guard/);
  assert.match(worker,/expiry\.outcome === 'VOTE_WINDOW_NOT_FINALIZED'\) return 'BLOCKED'/);
  assert.match(worker,/await recordTwoRoundResolution\(network, code, expiry\.proof\)/);
  assert.match(worker,/result\.started === false && typeof result\.reason === 'string'/);
  assert.doesNotMatch(worker,/console\.info\([^\n]*(?:walletAddress|invitee_wallet|p_events)/);
});
