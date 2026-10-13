import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const lifetimeBudgetMigration = await readFile(
  new URL('../supabase/migrations/20260904203500_lock_reward_cohort_lifetime_budget.sql', import.meta.url),
  'utf8',
);
const predictivePlanning = await readFile(
  new URL('../src/lib/rewards/predictivePlanning.ts', import.meta.url),
  'utf8',
);

test('paid reservations permanently consume cohort funding while cancelled ones release it', () => {
  assert.match(
    lifetimeBudgetMigration,
    /create or replace function public\.read_reward_cohort_committed_wei/,
  );
  assert.match(
    lifetimeBudgetMigration,
    /q\.status in \('AWAITING_CLAIM','QUEUED','ASSIGNED'\)/,
  );
  assert.match(
    lifetimeBudgetMigration,
    /CANCELLED[\s\S]*releases its unused cohort budget/,
  );
  assert.doesNotMatch(
    lifetimeBudgetMigration,
    /paid\.status = 'PAID'/,
  );
});

test('database budget guard counts live and already-paid assigned reservations', () => {
  assert.match(
    lifetimeBudgetMigration,
    /ASSIGNED stays live after[\s\S]*CANCELLED is intentionally released/,
  );
  assert.match(
    lifetimeBudgetMigration,
    /v_existing \+ new\.reserved_amount_wei > v_budget/,
  );
  assert.match(
    lifetimeBudgetMigration,
    /REWARD_COHORT_BUDGET_EXCEEDED/,
  );
});

test('application pricing reads exact lifetime cohort commitment from the DB snapshot', () => {
  // The snapshot itself calls the authoritative committed-funding reader and
  // casts Wei to text. Calling its numeric-returning RPC separately is unsafe.
  assert.match(predictivePlanning, /read_reward_cohort_committed_wei/);
  assert.match(predictivePlanning, /read_reward_cohort_planning_snapshot/);
  assert.match(predictivePlanning, /record\.cohortReservedWei/);
  assert.match(predictivePlanning, /cohortReservedWei must be an exact decimal string/);
  assert.doesNotMatch(
    predictivePlanning,
    /supabaseAdmin\.rpc\(\s*'read_reward_cohort_committed_wei'/,
  );
});
