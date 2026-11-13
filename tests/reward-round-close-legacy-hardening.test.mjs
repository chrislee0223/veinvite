import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('docs/staged-sql/20261113_round_close_retire_legacy_pause_v2.sql','utf8');
const bridge = readFileSync('src/lib/rewards/voteRoundCloseReservation.ts','utf8');
const sweep = readFileSync('src/lib/rewards/rewardReservation.ts','utf8');
const legacyProof = readFileSync('src/lib/rewards/transactionVerification.ts','utf8');
const legacyClaim = readFileSync('src/app/api/invites/[code]/claim/route.ts','utf8');

test('all legacy algorithms blocked from creating any new future-round queue reservation',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public.guard_vote_round_close_single_reservation_v1/);
  assert.match(sql,/NEW.reservation_algorithm_version IS DISTINCT FROM 'shared-pool-v1'/);
  assert.match(sql,/VOTE_ROUND_CLOSE_LEGACY_NEW_RESERVATION_BLOCKED/);
  assert.match(sql,/NEW.reservation_basis->>'roundClosePolicy'/);
  assert.match(sql,/NEW.reservation_basis->>'quoteKind'/);
  assert.match(sql,/NEW.reservation_basis->>'batchVerifiedCount'/);
  assert.match(sql,/BEFORE INSERT OR UPDATE OF reserved_amount_wei,reservation_algorithm_version,reservation_basis,status/);
  assert.match(sql,/IF v_vote_round IS NULL OR v_vote_round<v_cfg.first_vote_round_id THEN/);
  assert.match(sql,/OLD.reserved_amount_wei IS NOT NULL/);
  assert.match(sql,/NEW.reservation_basis IS NOT DISTINCT FROM OLD.reservation_basis/);
});

test('future-only reversible pause keeps old immutable claims usable',()=>{
  assert.match(sql,/ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false/);
  assert.match(sql,/set_reward_vote_round_close_pause_v1/);
  assert.match(sql,/VOTE_ROUND_CLOSE_NEW_RESERVATIONS_PAUSED/);
  assert.match(sql,/FOR SHARE/);
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('veinvite_reward_reservation_mainnet',0\)\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public.set_reward_vote_round_close_pause_v1\(boolean,text\)/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public.set_reward_vote_round_close_pause_v1\(boolean,text\)[\s\S]*TO service_role/);
  assert.match(bridge,/mode.paused/);
  assert.match(bridge,/ROUND_CLOSE_PAUSED/);
  assert.match(bridge,/mode === 'PAUSED'/);
  assert.match(bridge,/if \(!mode.enabled \|\| mode.paused\) return \[\]/);
});

test('batch settlement counts recipients exactly once; retries are not new rewards',()=>{
  assert.match(bridge,/mode === 'ROUND_BATCH_RESERVED'/);
  assert.match(bridge,/count < 1 \|\| count > 5000/);
  assert.match(bridge,/mode === 'ALREADY_RESERVED'/);
  assert.match(bridge,/kind: 'RESERVED', count: 0/);
  assert.match(sweep,/if \(roundClose.count === 0\)/);
  assert.match(sweep,/result.reserved \+= outcome.count/);
  assert.match(sweep,/result.attempted \+= outcome.count - 1/);
});

test('still used historical Claim and transaction verification must NOT be removed',()=>{
  assert.match(legacyProof,/transactionVerificationLegacy/);
  assert.match(legacyClaim,/legacyClaimRecovery/);
  assert.doesNotMatch(sql,/DROP FUNCTION .*legacy/i);
  assert.doesNotMatch(sql,/DELETE FROM public\.reward_queue_entries/i);
});
