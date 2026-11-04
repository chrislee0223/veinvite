import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../supabase/drafts/reward_unified_v3_shadow_ledger.sql', import.meta.url),
  'utf8',
);

test('new v3 financial tables live in private, RLS-protected schema', () => {
  assert.match(sql,/create schema if not exists reward_unified_v3/i);
  assert.match(sql,/revoke all on schema reward_unified_v3\s+from public, anon, authenticated, service_role/i);
  for(const table of ['settlements','entitlements','x_events']){
    assert.match(sql,new RegExp('create table reward_unified_v3\\.'+table,'i'));
    assert.match(sql,new RegExp('alter table reward_unified_v3\\.'+table+' enable row level security','i'));
  }
});

test('one immutable settlement per round and one payment entitlement per invite', () => {
  assert.match(sql,/unique \(network,app_id,veBetter_round_id\)/i);
  assert.match(sql,/unique \(network,invite_code\)/i);
  assert.match(sql,/unique \(settlement_id,invite_code\)/i);
  assert.match(sql,/unified_settlement_immutable[\s\S]*before update or delete/i);
  assert.match(sql,/unified_entitlement_immutable[\s\S]*before update or delete/i);
  assert.match(sql,/unified_x_event_immutable[\s\S]*before update or delete/i);
});

test('total reward includes X hold, zero-recipient carryover and old liabilities', () => {
  assert.match(sql,/pool_balance_wei\s*=\s*existing_liability_wei \+ available_wei/i);
  assert.match(sql,/settled_total_wei\s*=\s*base_total_wei \+ x_hold_total_wei/i);
  assert.match(sql,/base_reward_wei \+ x_hold_wei = total_reward_wei/i);
  assert.match(sql,/x_hold_wei = 10000000000000000000::numeric/i);
  assert.match(sql,/recipient_count = 0 and settled_total_wei = 0/i);
});

test('cutoff proof and Sybil clearance evidence are first-class commitments', () => {
  assert.match(sql,/pool_snapshot_finalized_block = cutoff_finalized_block/i);
  assert.match(sql,/completion_finalized_block bigint not null/i);
  assert.match(sql,/sybil_assessment_revision text not null/i);
  assert.match(sql,/snapshot_digest text not null/i);
});

test('no unsafe live cutover, legacy mutation, public function, or migration auto-run', () => {
  assert.match(sql,/PROPOSAL \/ NOT AN APPLIED MIGRATION/i);
  assert.match(sql,/revoke all on all tables in schema reward_unified_v3/i);
  assert.doesNotMatch(sql,/create or replace function public\./i);
  assert.doesNotMatch(sql,/delete\s+from\s+public\./i);
  assert.doesNotMatch(sql,/update\s+public\./i);
  assert.doesNotMatch(sql,/drop\s+(?:table|function|trigger)\s+public\./i);
  assert.doesNotMatch(sql,/\binsert\s+into\s+public\./i);
});
