import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [usageMigration, viewsMigration, reportsMigration] = await Promise.all([
  read('supabase/migrations/20260903130000_exclude_admin_wallets_from_usage_analytics.sql'),
  read('supabase/migrations/20260903131000_exclude_admin_wallets_from_operator_views.sql'),
  read('supabase/migrations/20260903132000_exclude_admin_wallets_from_operator_reports.sql'),
]);

const ADMIN_WALLETS = [
  '0xeff325935b63299e9eeda79931bed6ec119aefcb',
  '0x9d3be3deec483340e8da1d6d56171b618a7aaf10',
  '0x52b4546c45267f33ca79b47abc1863d853bf8917',
];

test('all three administrator wallets are explicitly seeded as analytics exclusions', () => {
  for (const wallet of ADMIN_WALLETS) {
    assert.match(usageMigration, new RegExp(wallet));
  }
  assert.match(
    usageMigration,
    /must never change eligibility, rewards, Sybil decisions, audit evidence, or canonical lifecycle records/i,
  );
});

test('admin filtering covers user funnel, leaderboards, impact and public lifetime ranking', () => {
  for (const object of [
    'operator_invitation_funnel',
    'operator_inviter_analytics',
    'operator_qualifying_dapp_reward_leaderboard',
    'operator_reward_recipient_leaderboard',
    'operator_referral_leaderboard',
    'operator_analytics_overview',
    'operator_impact_totals',
    'get_public_lifetime_leaderboard',
  ]) {
    assert.match(viewsMigration, new RegExp(object));
  }
  assert.match(viewsMigration, /is_analytics_excluded_wallet/);
  assert.match(viewsMigration, /is_analytics_excluded_invite_code/);
});

test('all operator round and cumulative report families enforce analytics exclusions', () => {
  for (const fn of [
    'get_operator_cumulative_dapp_rewards',
    'get_operator_cumulative_reward_recipients',
    'get_operator_round_dapp_rewards',
    'get_operator_round_reward_recipients',
    'get_operator_cumulative_inviter_analytics',
    'get_operator_round_inviter_analytics',
    'get_operator_cumulative_overview',
    'get_operator_round_overview',
  ]) {
    assert.match(reportsMigration, new RegExp(fn));
  }
  assert.match(reportsMigration, /is_analytics_excluded_wallet/);
  assert.match(reportsMigration, /is_analytics_excluded_invite_code/);
});

test('analytics exclusion migrations never mutate or delete canonical VeInvite records', () => {
  const canonicalMutationPatterns = [
    /delete\s+from\s+public\.invitations/i,
    /delete\s+from\s+public\.wallet_auth_sessions/i,
    /delete\s+from\s+public\.eligibility_check_events/i,
    /delete\s+from\s+public\.invite_impact_events/i,
    /delete\s+from\s+public\.reward_queue_entries/i,
    /delete\s+from\s+public\.reward_payouts/i,
    /delete\s+from\s+public\.reward_receipts/i,
    /update\s+public\.invitations\s+set/i,
    /update\s+public\.wallet_auth_sessions\s+set/i,
    /update\s+public\.reward_(?:queue_entries|payouts|receipts)\s+set/i,
  ];

  const combined = `${usageMigration}\n${viewsMigration}\n${reportsMigration}`;
  for (const pattern of canonicalMutationPatterns) {
    assert.doesNotMatch(combined, pattern);
  }
});

test('anonymous usage suppression stores no wallet identity in visitor telemetry', () => {
  assert.match(usageMigration, /create table if not exists public\.app_usage_excluded_visitors/);
  assert.match(usageMigration, /create table if not exists public\.app_usage_session_view_counts/);
  assert.match(usageMigration, /No wallet address or wallet hash is stored here/);
  assert.doesNotMatch(
    usageMigration.match(/create table if not exists public\.app_usage_excluded_visitors[\s\S]*?\);/)?.[0] ?? '',
    /wallet_address/i,
  );
});
