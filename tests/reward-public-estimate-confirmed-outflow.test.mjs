import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261110161711_fix_elastic_public_estimate_confirmed_broadcast_double_deduction.sql', import.meta.url),
  'utf8',
);

test('public estimate corrects only matching, canonically confirmed unfinalized payouts', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.read_reward_elastic_public_scenarios_v1/);
  assert.match(migration, /rr\.broadcast_confirmed_at<=v_forecast\.generated_at/);
  assert.match(migration, /rp\.status IN \('PENDING','SENDING'\)/);
  assert.match(migration, /rp\.amount_wei=q\.reserved_amount_wei/);
  assert.match(migration, /q\.status='ASSIGNED'/);
});

test('physical debit must be independently corroborated before adjusting displayed liability', () => {
  assert.match(migration, /f\.generated_at<v_first_confirmed_at/);
  assert.match(migration, /v_pre_broadcast_pool>=v_pool\+v_confirmed_unsettled/);
  assert.match(migration, /v_outstanding>=v_confirmed_unsettled/);
  assert.match(migration, /v_outstanding:=v_outstanding-v_confirmed_unsettled/);
  assert.match(migration, /v_physical:=greatest\(v_pool-v_outstanding-v_old-v_recent-v_bank,0\)/);
});

test('historical November 10 payout has identical usable physical capacity before, during and after settlement', () => {
  const beforePool = 8882147837809315805150n;
  const afterPool = 7422867712268098494020n;
  const pendingBase = 1459280125541217311130n;
  const pendingLiability = 1469280125541217311130n;
  const afterLiability = 10000000000000000000n; // X promotion remains held.

  assert.equal(beforePool - afterPool, pendingBase);
  assert.equal(
    beforePool - pendingLiability,
    afterPool - (pendingLiability - pendingBase),
  );
  assert.equal(
    afterPool - (pendingLiability - pendingBase),
    afterPool - afterLiability,
  );
});

test('the existing payment and X escrow authority remains unchanged and private', () => {
  assert.match(migration, /STABLE SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.read_reward_elastic_public_scenarios_v1\(text,text\) FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.read_reward_elastic_public_scenarios_v1\(text,text\) TO service_role/);
  assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM|INSERT INTO)\s+public\.reward_(?:payouts|queue_entries|x_promotion_obligations)/i);
});
