import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20261005003000_add_reward_recovery_offset_accounting.sql';

async function sources() {
  const [
    sql,
    hardeningSql,
    metricsSql,
    preserveMetricsSql,
    restrictionRecoverySql,
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
      'supabase/migrations/20261005023000_align_recovery_settled_referral_metrics.sql',
      'utf8',
    ),
    readFile(
      'supabase/migrations/20261005024000_preserve_legacy_round_metrics_with_recovery.sql',
      'utf8',
    ),
    readFile(
      'supabase/migrations/20261005034500_restore_recovery_on_restricted_settlement.sql',
      'utf8',
    ),
    readFile('src/components/InAppInviteNotifications.tsx', 'utf8'),
    readFile('src/lib/i18n/rewardAdjustedCopy.ts', 'utf8'),
    readFile('src/app/api/leaderboard/route.ts', 'utf8'),
  ]);
  return {
    sql,
    hardeningSql,
    metricsSql,
    preserveMetricsSql,
    restrictionRecoverySql,
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


test('a restricted recovery-settled referral restores consumed economic value', async () => {
  const { restrictionRecoverySql } = await sources();
  assert.match(
    restrictionRecoverySql,
    /create or replace function public\.upsert_reward_recovery_obligation_for_restriction/u,
  );
  assert.match(
    restrictionRecoverySql,
    /v_desired :=[\s\S]*?v_settlement\.offset_amount_wei \+[\s\S]*?coalesce\(v_receipt\.amount_wei,0\)/u,
  );
  assert.match(
    restrictionRecoverySql,
    /v_assessment\.state<>'RESTRICTED'/u,
  );
  assert.match(
    restrictionRecoverySql,
    /source_settlement_id=v_settlement\.id/u,
  );
});

test('an unpaid partial offset restores only the consumed offset, never the unpaid net', async () => {
  const { restrictionRecoverySql } = await sources();
  const start = restrictionRecoverySql.indexOf(
    'create or replace function public.upsert_reward_recovery_obligation_for_restriction',
  );
  const end = restrictionRecoverySql.indexOf(
    'create or replace function public.sync_reward_recovery_invalidation',
  );
  assert.ok(start >= 0 && end > start);
  const fn = restrictionRecoverySql.slice(start, end);
  assert.match(
    fn,
    /v_desired :=[\s\S]*?v_settlement\.offset_amount_wei \+[\s\S]*?coalesce\(v_receipt\.amount_wei,0\)/u,
  );
  assert.doesNotMatch(fn, /v_settlement\.gross_amount_wei/u);
  assert.match(
    fn,
    /A cancelled\/unpaid net amount never becomes debt/u,
  );
});

test('restriction and assessment trigger ordering both restore recovery idempotently', async () => {
  const { restrictionRecoverySql } = await sources();
  assert.match(
    restrictionRecoverySql,
    /create trigger sybil_v2_reward_recovery_restriction_sync[\s\S]*?after insert or update of status[\s\S]*?sybil_v2_wallet_restrictions/u,
  );
  assert.match(
    restrictionRecoverySql,
    /create trigger sybil_v2_reward_recovery_restricted_assessment_sync[\s\S]*?after insert or update of state[\s\S]*?sybil_v2_referral_assessments/u,
  );
  assert.match(
    restrictionRecoverySql,
    /create unique index if not exists reward_recovery_obligations_settlement_uidx/u,
  );
  assert.match(
    restrictionRecoverySql,
    /o\.source_restriction_id=v_restriction\.id[\s\S]*?or o\.source_settlement_id=v_settlement\.id/u,
  );
});

test('formal invalidation and current restriction cannot double-create recovery for one settlement', async () => {
  const { restrictionRecoverySql } = await sources();
  assert.match(
    restrictionRecoverySql,
    /o\.source_invalidation_id=v_invalidation\.id[\s\S]*?v_settlement\.id is not null[\s\S]*?o\.source_settlement_id=v_settlement\.id/u,
  );
  assert.match(
    restrictionRecoverySql,
    /source_invalidation_id=v_invalidation\.id,[\s\S]*?source_restriction_id=null/u,
  );
  assert.match(
    restrictionRecoverySql,
    /num_nonnulls\(source_invalidation_id,source_restriction_id\)=1/u,
  );
});

test('recovery balance mutations share the reservation wallet advisory lock', async () => {
  const { hardeningSql, restrictionRecoverySql } = await sources();
  assert.match(
    hardeningSql,
    /'veinvite_reward_recovery_' \|\| v_network \|\| '_' \|\|[\s\S]*?lower\(v_invitation\.inviter_wallet\)/u,
  );
  const lockMatches = restrictionRecoverySql.match(
    /'veinvite_reward_recovery_'/gu,
  ) ?? [];
  assert.ok(lockMatches.length >= 4);
});

test('restriction reinstatement follows the agreed reverse-or-manual-review policy', async () => {
  const { restrictionRecoverySql } = await sources();
  assert.match(
    restrictionRecoverySql,
    /status='REVERSED'[\s\S]*?'SOURCE_RESTRICTION_REINSTATED_BEFORE_CONSUMPTION'/u,
  );
  assert.match(
    restrictionRecoverySql,
    /status='FROZEN'[\s\S]*?'SOURCE_RESTRICTION_REINSTATED_AFTER_CONSUMPTION'/u,
  );
  assert.match(
    restrictionRecoverySql,
    /'SOURCE_RESTRICTION_REINSTATED_AFTER_CONSUMPTION'[\s\S]*?reward_recovery_review_queue/u,
  );
});


test('late receipt also tops up a restriction-sourced recovery obligation', async () => {
  const { restrictionRecoverySql } = await sources();
  const start = restrictionRecoverySql.indexOf(
    'create or replace function public.sync_reward_recovery_receipt',
  );
  const end = restrictionRecoverySql.indexOf(
    'create or replace function public.sync_reward_recovery_invalidation',
  );
  assert.ok(start >= 0 && end > start);
  const fn = restrictionRecoverySql.slice(start, end);
  assert.match(
    fn,
    /sybil_v2_referral_invalidations[\s\S]*?if v_invalidation_id is not null[\s\S]*?upsert_reward_recovery_obligation_for_invalidation/u,
  );
  assert.match(
    fn,
    /sybil_v2_wallet_restrictions[\s\S]*?a\.state='RESTRICTED'[\s\S]*?upsert_reward_recovery_obligation_for_restriction/u,
  );
});


test('historical reinstatement cannot erase a still-active current restriction', async () => {
  const { restrictionRecoverySql } = await sources();
  const start = restrictionRecoverySql.indexOf(
    'create or replace function public.sync_reward_recovery_invalidation',
  );
  const end = restrictionRecoverySql.indexOf(
    'create or replace function public.sync_reward_recovery_restriction',
  );
  assert.ok(start >= 0 && end > start);
  const fn = restrictionRecoverySql.slice(start, end);
  assert.match(
    fn,
    /if new\.status='REINSTATED'[\s\S]*?upsert_reward_recovery_obligation_for_restriction\(r\.id\)/u,
  );
  assert.match(
    fn,
    /a\.state='RESTRICTED'[\s\S]*?r\.status='ACTIVE'/u,
  );
});
