import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('supabase/migrations/20261009133500_reconcile_receipt_verified_paid_notifications.sql', 'utf8');
const route = readFileSync('src/app/api/notifications/history/route.ts', 'utf8');

test('reconcile requires paid status plus matching receipt and invitation inviter', () => {
  for (const clause of [
    "p.status = 'PAID'", "i.reward_status = 'PAID'",
    'r.payout_id = p.id', 'r.amount_wei = p.amount_wei',
    'r.tx_id = p.tx_id', 'r.paid_at = p.paid_at',
    'i.inviter_wallet = p.recipient_wallet', 'p.recipient_wallet = v_wallet',
    "p.tx_id ~ '^0x[0-9a-f]{64}$'",
  ]) assert.ok(sql.includes(clause), 'missing proof: ' + clause);
});
test('reconciliation is deduped, service-only, and does not alter finance / reads', () => {
  assert.match(sql, /on conflict \(dedupe_key\) do nothing/);
  assert.match(sql, /not exists \(\s*select 1 from public\.invite_notification_history h/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reconcile_verified_paid_reward_history\(text\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reconcile_verified_paid_reward_history\(text\) TO service_role/);
  assert.doesNotMatch(sql, /\b(?:update|delete)\s+(?:from\s+)?public\.(?:reward_payouts|reward_receipts|invitations|invite_notification_history_reads)\b/i);
});
test('all 3 read/count/ack functions archive progress after paid', () => {
  assert.equal((sql.match(/final_outcome\.kind in \('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REFERRAL_INVALIDATED', 'REWARD_PAID'\)/g) || []).length, 3);
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\./g) || []).length, 4);
});
test('reconciliation is wallet scoped and cannot make first-page history unavailable on error', () => {
  assert.match(route, /if \(beforeId === null\)/);
  assert.match(route, /'reconcile_verified_paid_reward_history'/);
  assert.match(route, /\{ p_inviter_wallet: wallet \}/);
  assert.match(route, /if \(reconciliationError\) \{/);
});
