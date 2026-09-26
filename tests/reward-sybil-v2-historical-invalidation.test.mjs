import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const foundationPath =
  'supabase/migrations/20260926040000_add_historical_sybil_referral_invalidation.sql';
const metricsPath =
  'supabase/migrations/20260926040100_apply_historical_sybil_invalidation_to_recognized_metrics.sql';

test('historical Sybil invalidation is reversible and never rewrites paid reward history', async () => {
  const sql = await readFile(foundationPath, 'utf8');

  assert.match(sql, /sybil_v2_referral_invalidations/u);
  assert.match(sql, /sybil_v2_referral_invalidation_events/u);
  assert.match(sql, /'ACTIVE','REINSTATED'/u);
  assert.match(sql, /'pastRewardChanged', false/u);
  assert.match(sql, /'restrictionScope', 'HISTORICAL_INVITEE_ONLY'/u);
  assert.match(sql, /lower\(v_invitation\.invitee_wallet\)/u);
  assert.match(sql, /HISTORICAL_REFERRAL_OPERATOR_BLACKLIST/u);
  assert.match(sql, /SECURITY_REFERRAL_INVALIDATED/u);
  assert.match(sql, /update public\.wallet_auth_sessions/u);
  assert.match(sql, /REINSTATED/u);
  assert.match(sql, /append-only/u);

  assert.doesNotMatch(sql, /update public\.reward_payouts/u);
  assert.doesNotMatch(sql, /update public\.reward_receipts/u);
  assert.doesNotMatch(sql, /delete from public\.reward_payouts/u);
  assert.doesNotMatch(sql, /delete from public\.reward_receipts/u);
  assert.doesNotMatch(
    sql,
    /update public\.invitations[\s\S]{0,200}sybil_status/u,
  );
});

test('historical invalidation is operator-only and protected by RLS', async () => {
  const sql = await readFile(foundationPath, 'utf8');

  assert.match(
    sql,
    /alter table public\.sybil_v2_referral_invalidations\s+enable row level security/u,
  );
  assert.match(
    sql,
    /revoke all on table public\.sybil_v2_referral_invalidations\s+from public, anon, authenticated/u,
  );
  assert.match(
    sql,
    /grant execute on function public\.resolve_sybil_v2_historical_referral[\s\S]*to service_role/u,
  );
  assert.match(
    sql,
    /revoke all on function public\.resolve_sybil_v2_historical_referral[\s\S]*from public, anon, authenticated/u,
  );
});

test('recognized metrics exclude invalidated referrals without changing accounting helpers', async () => {
  const sql = await readFile(metricsPath, 'utf8');

  assert.match(
    sql,
    /get_lifetime_paid_referral_ranking_v2_internal/u,
  );
  assert.match(
    sql,
    /not public\.is_sybil_v2_referral_invalidated\(\s*r\.invite_code,\s*p\.network\s*\)/u,
  );
  assert.match(sql, /qualified_referral_network_edges/u);
  assert.match(sql, /network_qualified_referral_relationships/u);
  assert.match(sql, /operator_referral_leaderboard/u);
  assert.match(sql, /get_operator_public_new_user_growth/u);
  assert.match(sql, /get_public_country_leaderboard/u);
  assert.match(sql, /operator_accepted_language_summary/u);

  assert.doesNotMatch(
    sql,
    /create or replace function public\.is_analytics_excluded_invite_code/u,
  );
  assert.doesNotMatch(sql, /get_veinvite_vebetter_round_report_v1_internal/u);
});

test('leaderboard movement is hidden when a later Sybil invalidation makes the old snapshot incomparable', async () => {
  const sql = await readFile(metricsPath, 'utf8');

  assert.match(sql, /get_leaderboard_comparison_status/u);
  assert.match(sql, /x\.decided_at > s\.published_at/u);
  assert.match(sql, /x\.status = 'ACTIVE'/u);
});

test('wallet session gate checks participation restrictions before rendering the app', async () => {
  const gate = await readFile(
    'src/components/WalletSessionGate.tsx',
    'utf8',
  );
  const route = await readFile(
    'src/app/api/auth/restriction/route.ts',
    'utf8',
  );
  const page = await readFile('src/app/page.tsx', 'utf8');

  assert.match(gate, /readWalletRestriction/u);
  assert.match(gate, /WalletRestrictionSurface/u);
  assert.match(gate, /restrictionKind === 'BLACKLIST'/u);
  assert.match(route, /loadActiveSybilV2Restriction/u);
  assert.match(route, /reviewPending/u);
  assert.match(page, /initialRestrictionKind/u);
  assert.match(page, /loadActiveSybilV2Restriction/u);
});


test('invalidated referral notification explains recognized-performance removal', async () => {
  const copy = await readFile(
    'src/lib/i18n/referralInvalidatedCopy.ts',
    'utf8',
  );
  const state = await readFile(
    'src/lib/notifications/inviteNotificationStateV2.ts',
    'utf8',
  );
  const history = await readFile(
    'src/components/UnifiedInviteNotificationHistoryCenter.tsx',
    'utf8',
  );

  assert.match(state, /SECURITY_REFERRAL_INVALIDATED/u);
  assert.match(history, /REFERRAL_INVALIDATED_COPY/u);
  assert.match(copy, /리더보드 보상 실적/u);
  assert.match(copy, /이미 온체인으로 지급된 B3TR은 변경되지 않아요/u);
});
