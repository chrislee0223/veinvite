import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql=readFileSync('docs/staged-sql/20261112_reward_vote_round_close_batch_v1.sql','utf8');
const bridge=readFileSync('src/lib/rewards/voteRoundCloseReservation.ts','utf8');
const reservation=readFileSync('src/lib/rewards/rewardReservation.ts','utf8');
const X=10n**19n;

test('future-only round-close mode is staged OFF and service-only',()=>{
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql,/VALUES \(1,false,125\)/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.commit_reward_vote_round_close_batch_v1\([\s\S]*TO service_role/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.commit_reward_vote_round_close_batch_v1\([\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(bridge,/VEINVITE_VOTE_ROUND_CLOSE_ENABLED !== 'true'/);
  assert.match(reservation,/tryReserveVoteRoundBatch\(/);
  assert.ok(reservation.indexOf('tryReserveVoteRoundBatch(')<reservation.indexOf("'commit_reward_shared_pool_v1'"));
});
test('completion round, not original referral round, determines equal-pay batch membership',()=>{
  assert.match(sql,/WHERE i\.vote_round_id=v_vote_round/);
  assert.match(sql,/a\.vebetter_round_id=v_vote_round/);
  assert.match(sql,/v_cfg\.grace_hours/);
  assert.match(sql,/read_reward_reservation_candidates_v2/);
  assert.match(sql,/e\.event_type='ALLOCATION_VOTE'/);
  assert.match(sql,/e\.vote_round_id=v_vote_round/);
  assert.match(sql,/AWAIT_FINAL_VOTE_PROOFS/);
  assert.match(sql,/v_verified<>v_completed/);
  assert.match(sql,/v_quote:=floor\(v_available\/v_verified\)/);
  assert.match(sql,/v_count<>v_verified/);
  assert.match(sql,/RAISE EXCEPTION 'VOTE_ROUND_CLOSE_ATOMIC_RESERVATION_FAILED/);
  assert.match(sql,/public\.commit_reward_reservation/);
  assert.doesNotMatch(sql,/DELETE FROM public\.reward_queue_entries|TRUNCATE\s+public\.reward_queue_entries/i);
});
test('X bonus and existing immutable liability protected for every eligible participant',()=>{
  assert.match(sql,/read_outstanding_reward_liability\(p_network,v_app\)/);
  assert.match(sql,/v_verified\*v_xcfg\.x_option_reserve_wei/);
  assert.match(sql,/v_prior>0/);
  assert.match(sql,/MIXED_IMMUTABLE_ROUND/);
  assert.match(sql,/HELD_ADMISSION_CONFLICT/);
  for(let n=1n;n<=4n;n++){
    const pool=7400n*(10n**18n);
    const alreadyFixed=150n*(10n**18n);
    const q=(pool-alreadyFixed-n*X)/n;
    assert.ok(q>0n);
    assert.ok(n*q+n*X+alreadyFixed<=pool);
  }
});
test('missing completion-round evidence cannot fall through to immediate legacy writer',()=>{
  assert.match(bridge,/rawVoteRoundId === null \|\| rawVoteRoundId === undefined/);
  assert.match(bridge,/throw new Error\('Vote-round settlement cannot resolve a verified completion round'\)/);
  assert.match(sql,/VOTE_ROUND_CLOSE_LEGACY_SINGLE_WRITER_BLOCKED/);
  assert.match(sql,/roundClosePolicy/);
});
test('SQL is deliberately not an unapplied production migration',()=>{
  assert.match(sql,/Review-only SQL in docs\/staged-sql/);
  assert.doesNotMatch(reservation,/commit_reward_vote_round_close_batch_v1'/);
});
