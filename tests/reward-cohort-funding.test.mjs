import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cohortMigration = await readFile(
  new URL('../supabase/migrations/20260904203000_bind_reward_cohorts_and_promo_funding.sql', import.meta.url),
  'utf8',
);
const payoutBridgeMigration = await readFile(
  new URL('../supabase/migrations/20260904203100_route_legacy_payout_to_reward_cohorts.sql', import.meta.url),
  'utf8',
);
const roundSafeMigration = await readFile(
  new URL('../supabase/migrations/20260904203200_make_reward_cohort_binding_round_safe.sql', import.meta.url),
  'utf8',
);
const forecastPolicy = await readFile(
  new URL('../src/lib/rewards/rewardForecastPolicy.ts', import.meta.url),
  'utf8',
);
const predictivePolicy = await readFile(
  new URL('../src/lib/rewards/predictivePolicy.ts', import.meta.url),
  'utf8',
);
const reservationServer = await readFile(
  new URL('../src/lib/rewards/rewardReservation.ts', import.meta.url),
  'utf8',
);

test('invitation cohort and source allocation are permanently paired', () => {
  assert.match(cohortMigration, /reward_cohort_round_id bigint/);
  assert.match(cohortMigration, /reward_funding_allocation_receipt_id bigint/);
  assert.match(cohortMigration, /invitations_reward_cohort_binding_check/);
  assert.match(cohortMigration, /REWARD_COHORT_BINDING_IMMUTABLE/);
  assert.match(cohortMigration, /v_receipt\.vebetter_round_id \+ 1 <> new\.reward_cohort_round_id/);
});

test('round 114 launch promotion is separate from official allocation evidence', () => {
  assert.match(cohortMigration, /reward_cohort_funding_adjustments/);
  assert.match(cohortMigration, /adjustment_type in \('PROMOTION'\)/);
  assert.match(cohortMigration, /1217330000000000000000/);
  assert.match(cohortMigration, /round-114-launch-promo-20260904/);
  assert.match(cohortMigration, /reward_cohort_round_id = 114/);
  assert.match(cohortMigration, /vebetter_round_id = 113/);
  assert.doesNotMatch(
    cohortMigration,
    /insert into public\.vebetter_round_allocations[\s\S]*round-114-launch-promo/,
  );
});

test('promotion ledger is append-only and validated against its source receipt', () => {
  assert.match(cohortMigration, /reward_cohort_funding_adjustments_immutable_guard/);
  assert.match(cohortMigration, /REWARD_COHORT_FUNDING_ADJUSTMENT_MISMATCH/);
  assert.match(cohortMigration, /before update or delete on public\.reward_cohort_funding_adjustments/);
});

test('reservation and payout are cohort scoped end-to-end', () => {
  assert.match(cohortMigration, /read_reward_reservation_candidates_v2/);
  assert.match(cohortMigration, /enforce_reward_queue_cohort_budget/);
  assert.match(cohortMigration, /REWARD_COHORT_BUDGET_EXCEEDED/);
  assert.match(cohortMigration, /prepare_reward_cohort_batch/);
  assert.match(cohortMigration, /i\.reward_funding_allocation_receipt_id = v_receipt\.id/);
  assert.match(reservationServer, /read_reward_reservation_candidates_v2/);
  assert.match(reservationServer, /rewardCohortRoundId/);
  assert.match(reservationServer, /fundingAllocationReceiptId/);
  assert.match(reservationServer, /completion_fixed_reservation_v2_cohort/);
});

test('legacy automatic payout worker is safely routed to the claimed cohort', () => {
  assert.match(payoutBridgeMigration, /create or replace function public\.prepare_predictive_reward_batch/);
  assert.match(payoutBridgeMigration, /read_next_claimed_reward_cohort/);
  assert.match(payoutBridgeMigration, /prepare_reward_cohort_batch/);
  assert.match(payoutBridgeMigration, /PER_INVITATION_FIXED_RESERVATION/);
});

test('round boundary never substitutes a newest allocation for missing exact funding', () => {
  assert.match(roundSafeMigration, /Never guess or substitute the newest receipt/);
  assert.match(roundSafeMigration, /bind_waiting_invitations_after_allocation/);
  assert.match(roundSafeMigration, /vebetter_allocations_bind_waiting_cohorts/);
  assert.match(roundSafeMigration, /e\.details ->> 'currentRoundId' = \(new\.vebetter_round_id \+ 1\)::text/);
});

test('public forecast and actual fixed pricing both use designated cohort funding', () => {
  assert.match(forecastPolicy, /reward-forecast-v2-cohort/);
  assert.match(forecastPolicy, /designatedBudget = officialAllocation \+ fundingAdjustment/);
  assert.match(forecastPolicy, /remainingCohortBudget/);
  assert.match(predictivePolicy, /predictive-reserve-v2-cohort/);
  assert.match(predictivePolicy, /designatedBudget = latestAllocation \+ fundingAdjustment/);
  assert.match(predictivePolicy, /cohortAvailableBudget/);
});
