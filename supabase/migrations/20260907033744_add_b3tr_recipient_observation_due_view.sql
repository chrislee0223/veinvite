begin;

-- Daily B3TR recipient observation is intentionally bounded to one approximate
-- day after the finalized payout block (VeChain block time ~= 10 seconds).
-- The view only selects receipts whose one-day horizon has not already been
-- covered by an append-only forensic snapshot.
create or replace view public.operator_reward_recipient_b3tr_observation_due
with (security_invoker = true)
as
select
  l.receipt_id,
  l.settlement_id,
  l.network,
  l.invite_code,
  l.recipient_wallet,
  l.amount_wei as payout_amount_wei,
  l.tx_id as payout_tx_id,
  l.paid_at,
  s.block_number as payout_block_number,
  (s.block_number + 8640)::bigint as target_scan_to_block
from public.reward_recipient_audit_ledger l
join public.reward_payout_transaction_settlements s
  on s.id = l.settlement_id
 and s.network = l.network
 and lower(s.tx_id) = lower(l.tx_id)
where l.paid_at <= now() - interval '24 hours'
  and not exists (
    select 1
    from public.reward_recipient_b3tr_flow_snapshots f
    where f.receipt_id = l.receipt_id
      and f.scan_to_block >= s.block_number + 8640
  );

revoke all on table public.operator_reward_recipient_b3tr_observation_due
  from public, anon, authenticated;
grant select on table public.operator_reward_recipient_b3tr_observation_due
  to service_role;

comment on view public.operator_reward_recipient_b3tr_observation_due is
  'Operator-only queue of finalized reward receipts due for one observation-only B3TR flow scan covering the first approximate 24 hours after payout. Existing snapshots at or beyond the target horizon suppress repeat work.';

commit;
