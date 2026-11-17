# Receipt-backed paid notifications at payout finalization

## Finding — 17 November 2026
ACXKGKC and R4LKDJM had PAID payouts and matching immutable paid receipts, but
zero REWARD_PAID notification history rows. The existing notification-history
GET route materialized receipts on demand; the payout finalization paths did
not materialize them before the recipient opened notification history.

The existing receipt-verified, idempotent DB reconciliation RPC was called
once for the sole affected wallet. It created **exactly 2** history records;
each is unread, no duplicates. This was a missed generation step, **not**
an observed exception from the SQL reconciliation function.

## Prevent recurrence without changing finance
Both automatic and submitted-recovery finalization paths now invoke one
service-side, best-effort helper *after* the canonical financial settlement RPC
returns success. It queries recipients of that already-PAID round and invokes
the existing receipt-verification/dedupe RPC. Errors are logged and swallowed
so a notification outage cannot cause a financial retry or second transaction.
No new alert type, no extra cron, no frontend poll, no new DB migration.
The existing authenticated notification history GET remains fallback for
process interruption or delayed materialization.

## Invariant
The materializer neither signs transactions nor modifies PAID, reward receipts,
payout amounts, X bonus state, invitations, or reward accounting.
