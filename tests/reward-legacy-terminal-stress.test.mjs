import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261112004000_release_terminal_legacy_stress_phantom_slots.sql',
  'utf8',
);
const helper = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION reward_admission_bridge.read_legacy_live_unpaid_stress_wei_v1'),
  migration.indexOf('-- Preserve all existing grants, signatures'),
);

// Snapshot extracted from Production at 2026-11-12 00:xx KST.
// These are immutable input fixtures, NEVER used to authorize payouts.
const rows = [
  ['218573871652502309639', 7, 6],
  ['33637365511474756174', 6, 5],
  ['40885429486108353820', 3, 1],
  ['232691422597025366016', 4, 4],
  ['110805439331916840960', 2, 2],
  ['196949790797450313728', 1, 1],
  ['145856230326545178266', 4, 3],
  ['207760198747344076800', 0, 0],
  ['482585964603801978407', 0, 0],
];

test('exact historical fixture releases only five terminal phantom slots, never living claims', () => {
  const frozen = rows.reduce((total, [wei, count]) => total + BigInt(wei) * BigInt(count), 0n);
  const live = rows.reduce((total, [wei, , count]) => total + BigInt(wei) * BigInt(count), 0n);
  const excess = frozen - live;
  assert.equal(rows.reduce((n, [, frozenCount, living]) => n + frozenCount - living, 0), 5);
  assert.ok(live > 0n && live < frozen);
  assert.equal(excess, 479838326462738951719n);
  assert.equal(frozen, 3787248864250255938753n);
  assert.equal(live, 3307410537787516987034n);
});

test('source calculation only releases terminal states, keeps ALL nonterminal unpaid including complete and old', () => {
  assert.match(helper, /i\.reward_cohort_round_id\s*=\s*p\.source_reward_cohort_round_id/);
  assert.match(helper, /i\.reward_funding_allocation_receipt_id\s*=\s*p\.source_allocation_receipt_id/);
  assert.match(helper, /coalesce\(i\.status,''\)\s*<>\s*'CANCELLED'/);
  assert.match(helper, /coalesce\(i\.sybil_status,''\)\s*<>\s*'BLOCKED'/);
  assert.match(helper, /i\.reward_paid_at IS NULL/);
  assert.doesNotMatch(helper, /i\.status IN \('ACTIVATING','UNDER_REVIEW'\)/);
  assert.doesNotMatch(helper, /interval\s*'\d+\s*(day|week)/i);
  assert.doesNotMatch(helper, /long_incomplete_count/);
});

test('preview and canonical settlement share ONE fail-closed live-collateral reader', () => {
  const marker = 'reward_admission_bridge.read_legacy_live_unpaid_stress_wei_v1(';
  assert.equal(migration.split(marker).length - 1, 5); // declaration, two grants, payout and preview
  assert.match(migration, /v_source_stress:=reward_admission_bridge\.read_legacy_live_unpaid_stress_wei_v1\(\s*p_network,v_app,v_inv\.reward_cohort_round_id\)/);
  assert.match(migration, /v_old:=reward_admission_bridge\.read_legacy_live_unpaid_stress_wei_v1\(\s*p_network,v_app,v_cohort\)/);
  assert.doesNotMatch(migration, /greatest\(p\.long_incomplete_count/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('veinvite_reward_reservation_'/);
  assert.match(migration, /v_own_contingent:=public\.read_reward_elastic_contingent_scope_liability_wei_v1/);
  assert.match(migration, /v_x_reserve:=\(v_valid\+v_unresolved\)\*v_cfg\.x_option_reserve_wei/);
  assert.match(migration, /v_physical_headroom:=greatest\(/);
  assert.match(migration, /v_confirmed_unsettled:=v_outstanding-v_confirmed_unsettled|v_outstanding:=v_outstanding-v_confirmed_unsettled/);
});

test('privileges are private; actual source snapshots, late quotes and payout ledger are not mutated', () => {
  assert.match(helper, /STABLE SECURITY INVOKER/);
  assert.match(helper, /REVOKE ALL ON FUNCTION reward_admission_bridge\./);
  assert.match(helper, /FROM PUBLIC, anon, authenticated/);
  assert.match(helper, /GRANT EXECUTE ON FUNCTION reward_admission_bridge\./);
  assert.doesNotMatch(helper, /(?:UPDATE|DELETE FROM|TRUNCATE|INSERT INTO)\s+(?:public\.)?(?:reward_boost_reserve_source_protections|reward_boost_reserve_ledger|reward_payouts|invitations)\b/i);
});
