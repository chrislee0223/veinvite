import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008131500_add_x_promotion_obligation_foundation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('obligation foundation stays disconnected from core reward readers', () => {
  assert.doesNotMatch(
    migration,
    /create or replace function public\.read_outstanding_reward_liability/,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.read_reward_cohort_committed_wei/,
  );
  assert.match(
    migration,
    /Foundation only: core reward liability and cohort commitment readers do not consume this table yet/,
  );
});

test('LIVE split atomically creates one immutable financial obligation', () => {
  assert.match(
    migration,
    /after insert on public\.reward_x_promotion_splits/,
  );
  assert.match(
    migration,
    /new\.mode='LIVE' and new\.promotion_amount_wei>0/,
  );
  assert.match(
    migration,
    /financial_state[\s\S]*'RESERVED'/,
  );
  assert.match(
    migration,
    /unique\(split_id\)/,
  );
  assert.match(
    migration,
    /unique\(invite_code\)/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OBLIGATION_SPLIT_MISMATCH/,
  );
});

test('financial state cannot double spend or reopen released value', () => {
  assert.match(
    migration,
    /old\.financial_state='RESERVED' and new\.financial_state in \('HELD','RELEASED'\)/,
  );
  assert.match(
    migration,
    /old\.financial_state='HELD' and new\.financial_state='RELEASED'/,
  );
  assert.doesNotMatch(
    migration,
    /old\.financial_state='RELEASED' and new\.financial_state/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OBLIGATION_TRANSITION_INVALID/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OBLIGATION_DELETE_FORBIDDEN/,
  );
});

test('HELD activation requires finalized base payout and receipt at exact base amount', () => {
  assert.match(
    migration,
    /p\.status='PAID'/,
  );
  assert.match(
    migration,
    /v_payout\.amount_wei<>v_split\.base_amount_wei/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_BASE_PAYOUT_MISMATCH/,
  );
  assert.match(
    migration,
    /r\.amount_wei=v_split\.base_amount_wei/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_BASE_RECEIPT_MISSING/,
  );
});

test('HELD activation fails closed on current Sybil invalidation or restriction', () => {
  assert.match(
    migration,
    /is_sybil_v2_referral_invalidated/,
  );
  assert.match(
    migration,
    /sybil_v2_wallet_restrictions/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SECURITY_NOT_CLEAR/,
  );
});

test('released value and post-base held liability have separate read authorities', () => {
  assert.match(
    migration,
    /read_reward_x_promotion_post_base_liability_wei/,
  );
  assert.match(
    migration,
    /financial_state='HELD'/,
  );
  assert.match(
    migration,
    /read_reward_x_promotion_cohort_released_wei/,
  );
  assert.match(
    migration,
    /financial_state='RELEASED'/,
  );
});

test('obligation tables are server-readable only and state changes use controlled RPCs', () => {
  assert.match(
    migration,
    /revoke all on table public\.reward_x_promotion_obligations[\s\S]*from public,anon,authenticated,service_role/,
  );
  assert.match(
    migration,
    /grant select on table public\.reward_x_promotion_obligations to service_role/,
  );
  assert.match(
    migration,
    /security definer[\s\S]*activate_reward_x_promotion_obligation_v1|activate_reward_x_promotion_obligation_v1[\s\S]*security definer/,
  );
  assert.match(
    migration,
    /grant execute on function public\.activate_reward_x_promotion_obligation_v1\(text\)[\s\S]*to service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.release_reward_x_promotion_obligation_v1\(text,text\)[\s\S]*to service_role/,
  );
});

test('audit events preserve original caller identity and are append-only', () => {
  assert.match(migration, /session_user/);
  assert.match(
    migration,
    /before update or delete on public\.reward_x_promotion_obligation_events/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OBLIGATION_EVENT_IMMUTABLE/,
  );
});
