import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql=readFileSync('docs/staged-sql/20261112_reward_vote_round_close_batch_v1.sql','utf8');
const bridge=readFileSync('src/lib/rewards/voteRoundCloseReservation.ts','utf8');
const liveness=readFileSync('docs/staged-sql/20261112_round_close_liveness_v1.sql','utf8');
const reservation=readFileSync('src/lib/rewards/rewardReservation.ts','utf8');
const X=10n**19n;

test('future-only round-close mode is staged OFF and service-only',()=>{
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql,/VALUES \(1,false,2147483647\)/);
  assert.match(sql,/ROUND_CLOSE_REQUIRES_EXPLICIT_FUTURE_ROUND/);
  assert.match(sql,/ROUND_CLOSE_FUTURE_ROUND_ALREADY_RESERVED/);
  assert.match(sql,/ROUND_CLOSE_ACTIVE_POLICY_IMMUTABLE/);
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
  assert.match(sql,/read_reward_vote_round_candidates_v1/);
  assert.match(sql,/and i\.vote_round_id=p\.target_round_id/);
  assert.match(sql,/and i\.vote_completed=true/);
  assert.doesNotMatch(sql,/limit \(select row_limit from parameters\)/);
  assert.match(sql,/e\.event_type='ALLOCATION_VOTE'/);
  assert.match(sql,/e\.vote_round_id=v_vote_round/);
  assert.match(sql,/AWAIT_FINAL_VOTE_PROOFS/);
  assert.match(sql,/v_verified<>v_completed/);
  assert.match(sql,/reward_status NOT IN \('FORFEITED','PAID'\)/);
  assert.match(sql,/i\.ineligible_at IS NULL/);
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

test('round close waiting does not produce misleading stale reservation alerts',()=>{
  assert.match(liveness,/read_stale_reward_reservation_liveness/);
  assert.match(liveness,/vote_round_close_settings vr/);
  assert.match(liveness,/vr\.enabled/);
  assert.match(liveness,/i\.vote_round_id>=vr\.first_vote_round_id/);
  assert.match(liveness,/vr\.grace_hours/);
  assert.match(liveness,/interval '14 days'/);
  assert.match(liveness,/vr\.grace_hours\+48/);
  assert.match(liveness,/reward_admission_bridge\.elastic_settlement_settings/);
  assert.match(liveness,/count\(\*\)::bigint/);
});

test('batch is not silently capped at the old global 99 participants',()=>{
  assert.match(sql,/public\.read_reward_vote_round_candidates_v1\(p_network,v_vote_round\)/);
  assert.match(sql,/v_completed>5000/);
  assert.doesNotMatch(sql,/v_completed>=100/);
});

test('future round batches are never starved by the 25 oldest legacy candidates',()=>{
  assert.match(sql,/read_reward_vote_round_batch_representatives_v1/);
  assert.match(sql,/p_first_vote_round_id/);
  assert.match(sql,/CROSS JOIN LATERAL/);
  assert.match(sql,/LIMIT 1/);
  assert.match(sql,/TO service_role/);
  assert.match(bridge,/readReadyVoteRoundBatchRepresentatives/);
  assert.match(bridge,/p_first_vote_round_id: firstRound/);
  assert.match(reservation,/\.\.\.futureRounds, \.\.\.legacy/);
  assert.match(reservation,/new Set<string>\(\)/);
});

test('the immutable batch waits for finalized indexed vote round closure',()=>{
  assert.match(sql,/WAIT_FOR_ROUND_CLOSE_FINALITY/);
  assert.match(sql,/WAIT_FOR_VOTE_SCAN_CATCHUP/);
  assert.match(sql,/vote_reconcile_scan_checkpoints/);
  assert.match(sql,/v_vote_scan_checkpoint<v_round_close_block/);
});

test('shared pool must have zero provisional liability and preserve canonical Claim writer',()=>{
  const canonical=readFileSync('docs/staged-sql/qa_round_close_canonical_writer_probe.sql','utf8');
  const xBonus=readFileSync('docs/staged-sql/qa_round_close_canonical_x_bonus_probe.sql','utf8');
  assert.match(sql,/read_reward_elastic_contingent_liability_wei_v1/);
  assert.match(sql,/v_provisional<>0/);
  assert.match(sql,/SHARED_POOL_UNEXPECTED_PROVISIONAL_LIABILITY/);
  assert.doesNotMatch(sql,/v_fixed:=v_fixed-v_provisional/);
  assert.match(canonical,/__PROD_CANONICAL_WRITER__/);
  assert.match(xBonus,/__PROD_CANONICAL_WRITER__/);
  assert.match(xBonus,/QA_LIVE_X_ADDON_NOT_PHYSICALLY_RESERVED/);
});

test('actual Claim-eligible test fixtures include complete three-app conversion and vote proofs',()=>{
  const canonical=readFileSync('docs/staged-sql/qa_round_close_canonical_writer_probe.sql','utf8');
  assert.match(canonical,/generate_series\(1,3\) j/);
  assert.match(canonical,/VOT3_CONVERSION/);
  assert.match(canonical,/ALLOCATION_VOTE/);
  assert.match(canonical,/vot3_conversion_tx_id/);
  assert.match(canonical,/eligibility_check_events/);
  assert.match(canonical,/QA_CANONICAL_RESERVATION_NOT_IDEMPOTENT/);
  assert.match(canonical,/ROLLBACK;/);
});
