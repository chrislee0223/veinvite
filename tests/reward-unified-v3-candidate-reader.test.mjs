import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../supabase/drafts/reward_unified_v3_candidate_reader.sql', import.meta.url),
  'utf8',
);

test('reader uses v2 assessment, exact matching clearance and invalidation checks', () => {
  assert.match(sql,/sybil_v2_referral_assessments/i);
  assert.match(sql,/sybil_v2_reward_clearances/i);
  assert.match(sql,/c\.assessment_revision=a\.revision/i);
  assert.match(sql,/c\.verdict='CLEAR'/i);
  assert.match(sql,/is_sybil_v2_referral_invalidated/i);
  assert.match(sql,/sybil_v2_wallet_restrictions/i);
});
test('late completers are included by current verified cutoff, not original cohort', () => {
  assert.match(sql,/completion\.block_number <= p_cutoff_finalized_block/i);
  assert.match(sql,/status='COMPLETED'/i);
  assert.match(sql,/reward_status='ELIGIBLE'/i);
  assert.doesNotMatch(sql,/i\.reward_cohort_round_id\s*=/i);
  assert.doesNotMatch(sql,/i\.reward_funding_allocation_receipt_id\s*=/i);
  assert.doesNotMatch(sql,/limit\s+(?:100|p_limit)/i);
});
test('exclude all previously rewarded, queued, settled, restricted invites',()=>{
  for(const term of [
    'reward_queue_entries','reward_payouts','reward_recovery_settlements',
    'reward_reservation_legacy_exclusions','reward_unified_v3.entitlements',
  ]) assert.match(sql,new RegExp(term,'i'));
  assert.match(sql,/i\.reward_paid_at is null/i);
});
test('candidate reader is read-only, private, with no direct service access',()=>{
  assert.match(sql,/PROPOSAL \/ NOT AN APPLIED MIGRATION/);
  assert.match(sql,/revoke all on function reward_unified_v3\.read_candidates_v1/i);
  assert.doesNotMatch(sql,/insert\s+into/i);
  assert.doesNotMatch(sql,/update\s+public\./i);
  assert.doesNotMatch(sql,/delete\s+from/i);
  assert.doesNotMatch(sql,/grant execute/i);
});
