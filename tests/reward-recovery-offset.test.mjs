import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20261005003000_add_reward_recovery_offset_accounting.sql';

async function sources() {
  const [
    sql,
    hardeningSql,
    restrictionSql,
    repricingSql,
    metricsSql,
    preserveMetricsSql,
    pauseSql,
    planningAlignmentSql,
    planningClient,
    history,
    copy,
    leaderboard,
  ] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(
      'supabase/migrations/20261005003050_harden_reward_recovery_reversals.sql',
      'utf8',
    ),
    readFile(
      'supabase/migrations/20261005033258_restore_recovery_on_restricted_settlement.sql',
      'utf8',
    ),
    readFile(
      'supabase/migrations/20261005124309_guard_recovery_cohort_repricing.sql',
      'utf8',
    ),
    readFile(
      'supabase/migrations/20261005023000_align_recovery_settled_referral_metrics.sql',
      'utf8',
    ),
    readFile(
      'supabase/migrations/20261005024000_preserve_legacy_round_metrics_with_recovery.sql',
      'utf8',
    ),
    readFile(
      'supabase/migrations/20261005124900_pause_reward_recovery_for_final_verification.sql',
      'utf8',
    ),
    readFile(
      'supabase/migrations/20261005125500_align_recovery_settled_planning_and_operator_eligibility.sql',
      'utf8',
    ),
    readFile('src/lib/rewards/predictivePlanning.ts', 'utf8'),
    readFile('src/components/InAppInviteNotifications.tsx', 'utf8'),
    readFile('src/lib/i18n/rewardAdjustedCopy.ts', 'utf8'),
    readFile('src/app/api/leaderboard/route.ts', 'utf8'),
  ]);
  return {
    sql,
    hardeningSql,
    restrictionSql,
    repricingSql,
    metricsSql,
    preserveMetricsSql,
    pauseSql,
    planningAlignmentSql,
    planningClient,
    history,
    copy,
    leaderboard,
  };
}

function settle(gross, recovery) {
  const offset = gross < recovery ? gross : recovery;
  return {
    offset,
    net: gross - offset,
    remaining: recovery - offset,
  };
}

test('recovery arithmetic preserves the agreed full and partial offset examples', () => {
  assert.deepEqual(settle(50n, 100n), {
    offset: 50n,
    net: 0n,
    remaining: 50n,
  });
  assert.deepEqual(settle(30n, 50n), {
    offset: 30n,
    net: 0n,
    remaining: 20n,
  });
  assert.deepEqual(settle(70n, 20n), {
    offset: 20n,
    net: 50n,
    remaining: 0n,
  });
  assert.deepEqual(settle(110n, 100n), {
    offset: 100n,
    net: 10n,
    remaining: 0n,
  });
});

test('recovery is feature-gated and normal reward liability remains net payable only', async () => {
  const { sql, hardeningSql } = await sources();
  assert.match(
    sql,
    /reward_recovery_enabled boolean not null default false/u,
  );
  assert.match(hardeningSql, /v_net:=p_amount_wei;/u);
  assert.match(
    hardeningSql,
    /v_offset:=least\(p_amount_wei,v_recovery_balance\);/u,
  );
  assert.match(hardeningSql, /v_net:=p_amount_wei-v_offset;/u);
  assert.match(
    hardeningSql,
    /reserved_amount_wei,[\s\S]*?\) values \([\s\S]*?'AWAITING_CLAIM',[\s\S]*?v_net/u,
  );
  assert.match(
    hardeningSql,
    /if v_net>greatest\(p_observed_pool_balance_wei-v_reserved,0\)/u,
  );
});

test('full offsets never create a zero-value payout queue entry', async () => {
  const { sql } = await sources();
  const queueBranch = sql.indexOf('if v_net>0 then');
  const fullBranch = sql.indexOf(
    "if v_offset<=0 or v_settlement.id is null then",
  );
  assert.ok(queueBranch >= 0 && fullBranch > queueBranch);
  const fullSql = sql.slice(fullBranch);
  assert.match(
    fullSql,
    /set slot_released_at=coalesce\(i\.slot_released_at,v_now\)/u,
  );
  assert.match(fullSql, /'REWARD_ADJUSTED'/u);
  assert.doesNotMatch(
    fullSql,
    /insert into public\.reward_payouts/u,
  );
  assert.doesNotMatch(
    fullSql,
    /insert into public\.reward_receipts/u,
  );
});

test('historical invalidated paid referrals seed immutable recovery obligations', async () => {
  const { sql } = await sources();
  assert.match(
    sql,
    /from public\.sybil_v2_referral_invalidations x[\s\S]*?join public\.reward_receipts r/u,
  );
  assert.match(sql, /where x\.status = 'ACTIVE'/u);
  assert.match(
    sql,
    /unique \(network, source_invalidation_id, source_receipt_id\)/u,
  );
});

test('later invalidation creates a new obligation without rewriting the old settlement', async () => {
  const { hardeningSql } = await sources();
  assert.match(
    hardeningSql,
    /REWARD_RECOVERY_SETTLEMENT_IMMUTABLE/u,
  );
  assert.match(
    hardeningSql,
    /v_desired :=[\s\S]*?v_settlement\.offset_amount_wei \+[\s\S]*?coalesce\(v_receipt\.amount_wei,0\)/u,
  );
  assert.doesNotMatch(
    hardeningSql,
    /set[\s\S]*?state='INVALIDATED'/u,
  );
  assert.match(
    hardeningSql,
    /status='FROZEN'[\s\S]*?'SOURCE_INVALIDATION_REINSTATED_AFTER_CONSUMPTION'/u,
  );
  assert.match(
    hardeningSql,
    /status='REVERSED'[\s\S]*?'SOURCE_INVALIDATION_REINSTATED_BEFORE_CONSUMPTION'/u,
  );
});

test('gross cohort fairness and net payout liability are separated', async () => {
  const { sql, hardeningSql } = await sources();
  assert.match(
    sql,
    /v_queue_committed \+ v_offset_committed/u,
  );
  assert.match(
    hardeningSql,
    /select coalesce\(sum\(s\.offset_amount_wei\),0\)[\s\S]*?from public\.reward_recovery_settlements s/u,
  );
  assert.match(
    hardeningSql,
    /v_existing_queue\+v_existing_offset\+[\s\S]*?new\.reserved_amount_wei\+v_current_offset>v_budget/u,
  );
});

test('full-offset legitimate referrals remain recognized without inventing reward value', async () => {
  const { sql, leaderboard } = await sources();
  assert.match(
    sql,
    /get_lifetime_recognized_referral_ranking_v3_internal/u,
  );
  assert.match(
    sql,
    /full_offset_referrals[\s\S]*?0::numeric as amount_wei/u,
  );
  assert.match(
    sql,
    /s\.settlement_kind='FULL_OFFSET'/u,
  );
  assert.match(
    leaderboard,
    /RANKING_ALGORITHM_VERSION = 'recognized_referrals_v3'/u,
  );
});

test('full-offset user messaging is bell history only and exposes no recovery balance', async () => {
  const { sql, history, copy } = await sources();
  assert.match(history, /'REWARD_ADJUSTED'/u);
  assert.match(
    copy,
    /친구 초대 보상이 VeInvite 보상 정책에 따라 조정되었습니다\. 정상 초대 활동은 기록되었습니다\./u,
  );
  assert.doesNotMatch(copy, /남음|상계액|빚|debt|remaining recovery/ui);
  assert.match(
    sql,
    /reward_amount_wei,dapp_progress,collapsed_progress[\s\S]*?null,[\s\S]*?null,[\s\S]*?false/u,
  );
});


test('a late paid receipt tops an active invalidation obligation up only by actual paid value', async () => {
  const { hardeningSql } = await sources();
  assert.match(
    hardeningSql,
    /create or replace function public\.sync_reward_recovery_receipt/u,
  );
  assert.match(
    hardeningSql,
    /after insert on public\.reward_receipts/u,
  );
  assert.match(
    hardeningSql,
    /greatest\(o\.amount_wei,v_desired\)/u,
  );
});

test('recovery balance counts append-only allocations even if the referral verdict later changes', async () => {
  const { hardeningSql } = await sources();
  const readerStart = hardeningSql.indexOf(
    'create or replace function public.read_reward_recovery_balance_wei',
  );
  const readerEnd = hardeningSql.indexOf(
    'create or replace function public.upsert_reward_recovery_obligation_for_invalidation',
  );
  assert.ok(readerStart >= 0 && readerEnd > readerStart);
  const reader = hardeningSql.slice(readerStart, readerEnd);
  assert.match(reader, /from public\.reward_recovery_allocations a/u);
  assert.doesNotMatch(reader, /reward_recovery_settlements/u);
  assert.match(reader, /o\.status='ACTIVE'/u);
});


test('full-offset legitimate referrals remain visible in activation and round participation metrics', async () => {
  const { metricsSql } = await sources();
  assert.match(
    metricsSql,
    /get_operator_public_new_user_growth[\s\S]*?settlement_kind = 'FULL_OFFSET'[\s\S]*?net_amount_wei = 0/u,
  );
  assert.match(
    metricsSql,
    /get_veinvite_vebetter_round_report[\s\S]*?v_completed_onboardings[\s\S]*?reward_recovery_settlements/u,
  );
  assert.match(
    metricsSql,
    /v_cumulative_completed[\s\S]*?reward_recovery_settlements/u,
  );
  assert.match(
    metricsSql,
    /is_sybil_v2_referral_invalidated/u,
  );
});


test('legacy queue-based round counts stay unchanged and full offsets are additive only', async () => {
  const { preserveMetricsSql } = await sources();
  assert.match(
    preserveMetricsSql,
    /select count\(distinct q\.invite_code\)[\s\S]*?into v_completed_onboardings[\s\S]*?q\.status <> 'CANCELLED'/u,
  );
  assert.match(
    preserveMetricsSql,
    /select v_completed_onboardings \+ count\(distinct s\.invite_code\)[\s\S]*?settlement_kind = 'FULL_OFFSET'/u,
  );
  assert.match(
    preserveMetricsSql,
    /select count\(distinct q\.invite_code\)[\s\S]*?into v_cumulative_completed/u,
  );
  assert.match(
    preserveMetricsSql,
    /select v_cumulative_completed \+ count\(distinct s\.invite_code\)[\s\S]*?settlement_kind = 'FULL_OFFSET'/u,
  );
});


test('current restricted referral authority restores only consumed economic value', async () => {
  const { restrictionSql } = await sources();
  assert.match(
    restrictionSql,
    /create or replace function public\.upsert_reward_recovery_obligation_for_restriction/u,
  );
  assert.match(
    restrictionSql,
    /v_desired :=[\s\S]*?v_settlement\.offset_amount_wei \+[\s\S]*?coalesce\(v_receipt\.amount_wei,0\)/u,
  );
  assert.match(
    restrictionSql,
    /A cancelled\/unpaid net amount never becomes debt/u,
  );
  assert.match(
    restrictionSql,
    /sybil_v2_reward_recovery_restriction_sync/u,
  );
  assert.match(
    restrictionSql,
    /sybil_v2_reward_recovery_restricted_assessment_sync/u,
  );
  assert.match(
    restrictionSql,
    /veinvite_reward_recovery_[\s\S]*?v_settlement\.recipient_wallet/u,
  );
});

test('recovery cohort repricing rejects stale gross-commitment quotes without changing normal pool liability', async () => {
  const { repricingSql } = await sources();
  assert.match(
    repricingSql,
    /p_basis \? 'cohortReservedWei'/u,
  );
  assert.match(
    repricingSql,
    /v_expected_cohort_committed[\s\S]*?cohortReservedWei/u,
  );
  assert.match(
    repricingSql,
    /if v_cohort_committed<>v_expected_cohort_committed then[\s\S]*?'RECALCULATE'/u,
  );
  assert.match(
    repricingSql,
    /Actual pool liability remains NET-only/u,
  );
  assert.match(
    repricingSql,
    /Gross remains the cohort pricing commitment\. Net remains the actual/u,
  );
});

test('invalidated or restricted recovery settlements release withheld cohort commitment', async () => {
  const { repricingSql } = await sources();
  const committedStart = repricingSql.indexOf(
    'CREATE OR REPLACE FUNCTION public.read_reward_cohort_committed_wei',
  );
  const budgetStart = repricingSql.indexOf(
    'CREATE OR REPLACE FUNCTION public.enforce_reward_queue_cohort_budget',
  );
  assert.ok(committedStart >= 0 && budgetStart > committedStart);
  const committed = repricingSql.slice(committedStart, budgetStart);
  assert.match(committed, /reward_recovery_settlements/u);
  assert.match(committed, /source_settlement_id/u);
  assert.match(committed, /status='ACTIVE'|status = 'ACTIVE'/u);
});

test('partial recovery achievement counts immediately but paid B3TR stays receipt-authoritative', async () => {
  const { repricingSql } = await sources();
  assert.match(
    repricingSql,
    /partial_unpaid_referrals[\s\S]*?0::numeric as amount_wei/u,
  );
  assert.match(
    repricingSql,
    /s\.settlement_kind='PARTIAL_OFFSET'/u,
  );
  assert.match(
    repricingSql,
    /not exists \([\s\S]*?from public\.reward_receipts r/u,
  );
  assert.match(
    repricingSql,
    /select \* from partial_unpaid_referrals/u,
  );
});

test('final verification pause is explicit and disaster-recovery reproducible', async () => {
  const { pauseSql } = await sources();
  assert.match(
    pauseSql,
    /set reward_recovery_enabled = false/u,
  );
});


test('actual pricing replaces raw queued eligible counts with the recovery-aware cleared count', async () => {
  const { planningClient } = await sources();
  assert.match(
    planningClient,
    /read_sybil_v2_cleared_unreserved_count/u,
  );
  assert.match(
    planningClient,
    /queuedEligibleCount:\s*clearedQueuedEligibleCount/u,
  );
  assert.match(
    planningClient,
    /read_reward_cohort_committed_wei/u,
  );
});

test('raw planning and legacy candidate readers exclude recovery-settled referrals', async () => {
  const { planningAlignmentSql } = await sources();
  assert.match(
    planningAlignmentSql,
    /read_predictive_reward_planning_snapshot[\s\S]*?reward_recovery_settlements/u,
  );
  assert.match(
    planningAlignmentSql,
    /read_reward_cohort_planning_snapshot[\s\S]*?reward_recovery_settlements/u,
  );
  assert.match(
    planningAlignmentSql,
    /read_reward_reservation_candidates[\s\S]*?reward_recovery_settlements/u,
  );
});

test('operator currently-eligible metrics exclude only fully settled zero-payable referrals', async () => {
  const { planningAlignmentSql } = await sources();
  for (const functionName of [
    'get_operator_round_overview',
    'get_operator_cumulative_overview',
    'get_operator_round_inviter_analytics',
    'get_operator_cumulative_inviter_analytics',
  ]) {
    const start = planningAlignmentSql.indexOf(
      `FUNCTION public.${functionName}`,
    );
    assert.ok(start >= 0, `${functionName} must be present`);
    const next = planningAlignmentSql.indexOf(
      'CREATE OR REPLACE FUNCTION public.',
      start + 1,
    );
    const body = planningAlignmentSql.slice(
      start,
      next >= 0 ? next : planningAlignmentSql.length,
    );
    assert.match(body, /settlement_kind='FULL_OFFSET'/u);
    assert.match(body, /net_amount_wei=0/u);
  }
});
