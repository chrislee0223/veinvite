import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  'supabase/migrations/20261017183000_add_x_promotion_paid_notifications.sql',
  'utf8',
);
const historyRoute = readFileSync(
  'src/app/api/notifications/history/route.ts',
  'utf8',
);
const kinds = readFileSync(
  'src/lib/notifications/inviteNotificationStateV2.ts',
  'utf8',
);
const policy = readFileSync(
  'src/lib/notifications/notificationPolicy.ts',
  'utf8',
);
const historyCenter = readFileSync(
  'src/components/UnifiedInviteNotificationHistoryCenter.tsx',
  'utf8',
);

test('X promotion paid notifications are derived only from finalized immutable payout evidence', () => {
  for (const proof of [
    'public.reward_x_promotion_receipts r',
    'public.reward_x_promotion_obligations o',
    "o.financial_state = 'PAID'",
    'o.paid_at = r.paid_at',
    'public.reward_x_promotion_splits x',
    "x.mode = 'LIVE'",
    'public.reward_x_promotion_payout_settlements s',
    's.tx_id = r.tx_id',
    's.paid_at = r.paid_at',
    'public.invitations i',
    'lower(r.recipient_wallet) = v_wallet',
    "r.tx_id ~ '^0x[0-9a-f]{64}$'",
  ]) {
    assert.ok(sql.includes(proof), 'missing X promotion notification proof: ' + proof);
  }
});

test('X promotion paid history is receipt-id deduped and service-role only', () => {
  assert.match(sql, /'xpromo:v1:' \|\| r\.id::text/);
  assert.match(sql, /on conflict \(dedupe_key\) do nothing/);
  assert.match(
    sql,
    /revoke all on function public\.reconcile_verified_x_promotion_paid_history\(text\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.reconcile_verified_x_promotion_paid_history\(text\)[\s\S]*to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /\b(?:update|delete)\s+(?:from\s+)?public\.reward_x_promotion_/i,
  );
});

test('notification schema and client policy expose X promotion paid as a tap-to-read durable bell item', () => {
  assert.match(sql, /'X_PROMOTION_PAID'::text/);
  assert.match(kinds, /\| 'X_PROMOTION_PAID'/);
  assert.match(policy, /X_PROMOTION_PAID: HISTORY_TAP/);
  assert.doesNotMatch(
    policy,
    /X_PROMOTION_PAID:[\s\S]{0,180}readBehavior: 'receipt'/,
  );
});

test('history first page reconciles X promotion receipts without making history unavailable', () => {
  assert.match(historyRoute, /if \(beforeId === null\)/);
  assert.match(
    historyRoute,
    /'reconcile_verified_x_promotion_paid_history'/,
  );
  assert.match(
    historyRoute,
    /X promotion paid notification reconciliation failed/,
  );
});

test('bell copy reuses localized X promotion copy and shows the paid amount separately', () => {
  assert.match(historyCenter, /REWARD_X_PROMOTION_COPY/);
  assert.match(
    historyCenter,
    /case 'X_PROMOTION_PAID':[\s\S]*xPromotion\.title[\s\S]*xPromotion\.paidBody/,
  );
  assert.match(
    historyCenter,
    /case 'X_PROMOTION_PAID':[\s\S]*hint: amount[\s\S]*B3TR/,
  );
});
