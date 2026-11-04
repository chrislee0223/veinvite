import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/lib/rewards/rewardReservation.ts',import.meta.url),'utf8',
);
const sql = readFileSync(
  new URL('../supabase/migrations/20261104190000_reward_admission_service_handoff_disabled.sql',import.meta.url),
  'utf8',
);

test('HELD candidates call atomic handoff, not legacy writer or payout signer',()=>{
  assert.match(source,/readAdmissionHoldForCompletion\(/);
  assert.match(source,/admission\.status === 'HELD'[\s\S]*'commit_reward_admission_held_to_fixed_v1'[\s\S]*'commit_reward_reservation_with_late_reserve'/);
  assert.match(source,/admission\.status === 'HELD' && !admission\.admissionEnabled[\s\S]*'ADMISSION_HANDOFF_DISABLED'/);
  assert.match(source,/admission\.status === 'CONVERTED'[\s\S]*admission\.status === 'RELEASED'[\s\S]*'ADMISSION_ALREADY_FINAL'/);
  assert.match(source,/BigInt\(admission\.guaranteedWei!\) > BigInt\(quotedAmountWei\)/);
  assert.match(source,/funding identity or exact Wei mismatch/);
});

test('service gateway retains private exact-ledger authority and disabled Production check',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.read_reward_admission_hold_for_reservation_v1/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.commit_reward_admission_held_to_fixed_v1/);
  assert.match(sql,/v_enabled IS DISTINCT FROM true[\s\S]*'ADMISSION_HANDOFF_DISABLED'/);
  assert.match(sql,/RETURN reward_admission_bridge\.commit_held_to_fixed_v1\(/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.commit_reward_admission_held_to_fixed_v1\([\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.commit_reward_admission_held_to_fixed_v1\([\s\S]*TO service_role/);
  assert.doesNotMatch(sql,/SET\s+enabled\s*=\s*true|DROP\s+CONSTRAINT\s+settings_enabled_check/i);
});

test('DB veto blocks creation of queue or recovery until held becomes converted',()=>{
  assert.match(sql,/IF EXISTS \([\s\S]*h\.status='HELD'[\s\S]*LEGACY_REWARD_WRITER_BLOCKED_BY_HELD_GUARANTEE/);
  assert.match(sql,/CREATE TRIGGER aa_reward_queue_reject_held_double_commit/);
  assert.match(sql,/CREATE TRIGGER aa_reward_recovery_reject_held_double_commit/);
  assert.doesNotMatch(sql,/INSERT INTO public\.reward_queue_entries|INSERT INTO public\.reward_recovery_settlements/i);
});
