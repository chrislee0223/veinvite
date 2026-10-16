import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const qaSql = await readFile(
  'supabase/qa-only/20261017_sybil_early_hold_review_slice.sql',
  'utf8',
);
const prodOperatorSql = await readFile(
  'supabase/migrations/20261001082500_allow_early_sybil_operator_blacklist.sql',
  'utf8',
);

test('QA operator queue includes pre-mission HOLDs; ready manual queue remains strict', () => {
  assert.match(qaSql, /create view public\.operator_sybil_v2_operator_action_candidates/u);
  assert.match(qaSql, /from public\.sybil_v2_referral_assessments a[\s\S]*a\.state = 'HOLD'/u);
  assert.match(qaSql, /create view public\.operator_sybil_v2_manual_review_candidates/u);
  assert.match(qaSql, /a\.required_checks[\s\S]*<@ coalesce\(a\.completed_checks/u);
  assert.match(prodOperatorSql, /operator_sybil_v2_operator_action_candidates/u);
});

test('QA early CLEAR DB guard matches Production intent; early BLACK stays operator-only', () => {
  assert.match(qaSql, /new\.source = 'OPERATOR'/u);
  assert.match(qaSql, /old\.state = 'HOLD'/u);
  assert.match(qaSql, /new\.state = 'CLEAR'/u);
  assert.match(qaSql, /- 'CHAIN_FINALITY'/u);
  assert.match(qaSql, /SYBIL_V2_CLEAR_CHECKS_INCOMPLETE/u);
  assert.match(qaSql, /create trigger sybil_v2_operator_decision_readiness_guard/u);
  assert.match(prodOperatorSql, /SYBIL_V2_CLEAR_CHECKS_INCOMPLETE/u);
});

test('QA-only schema does not enable payouts, copy user data, or grant public access', () => {
  assert.match(qaSql, /-- NOT a Production migration/u);
  assert.match(qaSql, /with \(security_invoker = true\)/u);
  assert.match(qaSql, /revoke all on public\.operator_sybil_v2_operator_action_candidates[\s\S]*from public, anon, authenticated/u);
  assert.match(qaSql, /revoke all on public\.operator_sybil_v2_manual_review_candidates[\s\S]*from public, anon, authenticated/u);
  assert.match(qaSql, /grant execute on function public\.read_sybil_v2_early_hold_liveness\(text\)[\s\S]*to service_role/u);
  assert.doesNotMatch(qaSql, /\b(insert into|update|delete from)\s+public\.(?:invitations|reward_queue_entries|sybil_v2_wallet_restrictions)/iu);
  assert.doesNotMatch(qaSql, /\b(?:wallet_secret|private_key|mnemonic|payout_enabled)\s*=/iu);
});
