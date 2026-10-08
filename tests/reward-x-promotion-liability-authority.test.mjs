import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008155500_centralize_x_promotion_liability_authority_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

const authorityCalls =
  migration.match(/read_outstanding_reward_liability\(/g) ?? [];

test('all four reward planning and commit paths share one liability authority', () => {
  assert.equal(authorityCalls.length, 4);
  assert.match(
    migration,
    /create or replace function public\.commit_reward_reservation/i,
  );
  assert.match(
    migration,
    /create or replace function public\.prepare_reward_cohort_batch/i,
  );
  assert.match(
    migration,
    /create or replace function public\.read_predictive_reward_planning_snapshot/i,
  );
  assert.match(
    migration,
    /create or replace function public\.read_reward_cohort_planning_snapshot/i,
  );
});

test('reservation commit uses authoritative liability before its pool guard', () => {
  const fn = migration.match(
    /CREATE OR REPLACE FUNCTION public\.commit_reward_reservation[\s\S]*?\$function\$/i,
  )?.[0] ?? '';
  assert.match(fn, /v_reserved := public\.read_outstanding_reward_liability/);
  assert.match(
    fn,
    /if v_reserved<>p_expected_reserved_before_wei[\s\S]*if v_net>greatest\(p_observed_pool_balance_wei-v_reserved,0\)/,
  );
});

test('batch keeps payout creation unchanged while only centralizing pool liability', () => {
  const fn = migration.match(
    /CREATE OR REPLACE FUNCTION public\.prepare_reward_cohort_batch[\s\S]*?\$function\$/i,
  )?.[0] ?? '';
  assert.match(
    fn,
    /v_reserved_existing := public\.read_outstanding_reward_liability/,
  );
  assert.match(
    fn,
    /select v_round_id,q\.invite_code,q\.recipient_wallet,q\.reserved_amount_wei,'PENDING'/,
  );
});

test('planning snapshots use the same authority', () => {
  const predictive = migration.match(
    /CREATE OR REPLACE FUNCTION public\.read_predictive_reward_planning_snapshot[\s\S]*?\$function\$/i,
  )?.[0] ?? '';
  const cohort = migration.match(
    /CREATE OR REPLACE FUNCTION public\.read_reward_cohort_planning_snapshot[\s\S]*?\$function\$/i,
  )?.[0] ?? '';
  assert.match(predictive, /v_reserved := public\.read_outstanding_reward_liability/);
  assert.match(cohort, /v_reserved := public\.read_outstanding_reward_liability/);
});

test('this migration does not enable X promotion or alter live payout amount selection', () => {
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_enabled\s*=\s*true/i,
  );
  assert.doesNotMatch(
    migration,
    /base_amount_wei\s*,\s*'PENDING'/i,
  );
});
