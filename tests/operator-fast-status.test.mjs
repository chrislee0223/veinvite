import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [projection, reconciliation, compaction] = await Promise.all([
  read('supabase/migrations/20260903150000_add_fast_operator_status_projections.sql'),
  read('supabase/migrations/20260903151000_add_fast_operator_reconciliation.sql'),
  read('supabase/migrations/20260903152000_align_usage_compaction_with_fast_projection.sql'),
]);

test('fast status remains a private derived layer', () => {
  for (const sql of [projection, reconciliation, compaction]) {
    assert.doesNotMatch(sql, /security\s+definer/iu);
  }

  for (const table of [
    'operator_fast_wallets',
    'operator_fast_wallet_days',
    'operator_fast_invitations',
    'operator_fast_usage_visitors',
    'operator_fast_reconciliation_log',
  ]) {
    assert.match(
      projection,
      new RegExp(`alter table public\\.${table} enable row level security`, 'u'),
    );
    assert.match(
      projection,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'u'),
    );
  }

  assert.doesNotMatch(projection, /insert into public\.reward_/iu);
  assert.doesNotMatch(projection, /update public\.reward_/iu);
  assert.doesNotMatch(projection, /delete from public\.reward_/iu);
});

test('wallet lifetime projection is rebuildable after ephemeral auth cleanup', () => {
  assert.match(projection, /event_type\s*=\s*'WALLET_AUTHENTICATED'/u);
  assert.match(projection, /from public\.veinvite_event_ledger/u);
  assert.match(projection, /from public\.wallet_auth_sessions/u);
  assert.match(projection, /on conflict \(wallet_address\) do update/u);
});

test('invitation projection preserves canonical new returning and legacy classification', () => {
  assert.match(projection, /INELIGIBLE_LIVE/u);
  assert.match(projection, /INELIGIBLE_LEGACY/u);
  assert.match(projection, /ACCEPTED_MODERN/u);
  assert.match(projection, /ACCEPTED_LEGACY/u);
  assert.match(projection, /LEGACY_UNCLASSIFIED/u);
  assert.match(projection, /legacy_entry_classification_backfill/u);
  assert.match(projection, /after insert or update or delete on public\.invitations/u);
});

test('usage projection records one daily visitor with their latest current language', () => {
  assert.match(projection, /primary key \(usage_date, visitor_key\)/u);
  assert.match(
    projection,
    /array_agg\([\s\S]*s\.current_locale[\s\S]*order by s\.last_seen_at desc, s\.updated_at desc, s\.session_id desc/u,
  );
  assert.match(projection, /current_locale = excluded\.current_locale/u);
  assert.match(projection, /app_usage_excluded_visitors_sync_operator_fast_projection/u);
  assert.match(projection, /set excluded = true/u);
});

test('fast read applies KST and centralized administrator exclusions', () => {
  assert.match(reconciliation, /Asia\/Seoul/u);
  assert.match(reconciliation, /analytics_excluded_wallets/u);
  assert.match(reconciliation, /authenticatedWalletsEver/u);
  assert.match(reconciliation, /authenticatedWalletsToday/u);
  assert.match(reconciliation, /allMissionsComplete/u);
  assert.match(reconciliation, /'locales',l\.value/u);
});

test('raw reconciliation remains independent of fast projection', () => {
  const rawStart = reconciliation.indexOf(
    'create or replace function public.compute_operator_raw_status',
  );
  const reconcileStart = reconciliation.indexOf(
    'create or replace function public.reconcile_operator_fast_status',
  );
  assert.ok(rawStart >= 0 && reconcileStart > rawStart);
  const raw = reconciliation.slice(rawStart, reconcileStart);

  assert.doesNotMatch(raw, /operator_fast_wallets/u);
  assert.doesNotMatch(raw, /operator_fast_invitations/u);
  assert.doesNotMatch(raw, /operator_fast_usage_visitors/u);
  assert.match(raw, /wallet_auth_sessions/u);
  assert.match(raw, /veinvite_event_ledger/u);
  assert.match(raw, /app_usage_sessions/u);
  assert.match(raw, /invitations/u);
  assert.match(reconciliation, /ok\s*:=\s*fc\s*=\s*s/u);
  assert.match(reconciliation, /operator_fast_reconciliation_log/u);
});

test('30-day compaction keeps only identifier-free final-language rollups', () => {
  assert.match(compaction, /array_agg\([\s\S]*s\.current_locale[\s\S]*order by s\.last_seen_at desc, s\.updated_at desc, s\.session_id desc/u);
  assert.match(compaction, /'locale'/u);
  assert.match(
    compaction,
    /delete from public\.operator_fast_usage_visitors[\s\S]*where usage_date = d/u,
  );
  assert.match(compaction, /delete from public\.app_usage_sessions/u);
  assert.doesNotMatch(compaction, /wallet_address\s+text/iu);
});
