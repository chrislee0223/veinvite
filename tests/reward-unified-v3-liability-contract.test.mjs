import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const sql=await readFile(new URL('../supabase/drafts/reward_unified_v3_liability_guards.sql',import.meta.url),'utf8');

test('financial ledger is private, append-only and cannot write to old payout state',()=>{
  assert.match(sql,/PROPOSAL \/ NOT AN APPLIED MIGRATION/);
  assert.match(sql,/create table reward_unified_v3\.base_events/);
  assert.match(sql,/unified_base_event_immutable/);
  assert.match(sql,/before update or delete on reward_unified_v3\.base_events/);
  assert.match(sql,/alter table reward_unified_v3\.base_events enable row level security/);
  assert.doesNotMatch(sql,/\bupdate\s+public\./i);
  assert.doesNotMatch(sql,/\bdelete\s+from\s+public\./i);
});
test('same user can never receive two different signed transfers under v3',()=>{
  assert.match(sql,/unique \(entitlement_id,event_type\)/i);
  assert.match(sql,/unique index unified_x_event_single_transition_idx/i);
  assert.match(sql,/guard_base_event\(\)/i);
  assert.match(sql,/guard_x_event\(\)/i);
  assert.match(sql,/UNIFIED_V3_BASE_PAID_WITHOUT_SIGNING/);
  assert.match(sql,/UNIFIED_V3_X_SIGNED_CANNOT_RELEASE/);
  assert.match(sql,/UNIFIED_V3_X_ALREADY_RELEASED/);
});
test('post must remain 24h and base must be paid before X offer is opened',()=>{
  assert.match(sql,/interval '24 hours'/);
  assert.match(sql,/UNIFIED_V3_X_24H_RETENTION_NOT_PROVEN/);
  assert.match(sql,/UNIFIED_V3_X_BASE_NOT_PAID/);
  assert.match(sql,/UNIFIED_V3_X_FINAL_PROOF_REQUIRED/);
});
test('new v3 outstanding includes base until PAID, X until PAID or RELEASED once',()=>{
  assert.match(sql,/read_outstanding_wei_v1/);
  assert.match(sql,/sum\(e\.base_reward_wei\)/);
  assert.match(sql,/event_type in \('RELEASED','PAID'\)/);
  assert.match(sql,/v_base \+ v_x/);
  assert.match(sql,/after base has been paid/i);
});
test('cannot sign a reward for a currently blocked wallet',()=>{
  assert.match(sql,/reward_x_promotion_security_clear_v1\(/);
  assert.match(sql,/UNIFIED_V3_X_SECURITY_REJECTED/);
  assert.match(sql,/UNIFIED_V3_BASE_SECURITY_REJECTED/);
});
