begin;

drop view if exists public.operator_reward_recipient_b3tr_observation_due;

-- Keep 78-digit wei values out of JavaScript number coercion by exposing the
-- payout amount as text. The same evidence surface is used by both manual and
-- scheduled B3TR recipient observation so settlement provenance cannot drift
-- between the two paths.
create or replace view public.operator_reward_recipient_b3tr_evidence
with (security_invoker = true)
as
select
  l.receipt_id,
  l.settlement_id,
  l.network,
  l.invite_code,
  l.recipient_wallet,
  l.amount_wei::text as payout_amount_wei,
  l.tx_id as payout_tx_id,
  l.paid_at,
  s.network as settlement_network,
  s.tx_id as settlement_tx_id,
  s.block_number as payout_block_number,
  (
    s.network = l.network
    and lower(s.tx_id) = lower(l.tx_id)
  ) as chain_evidence_matches
from public.reward_recipient_audit_ledger l
join public.reward_payout_transaction_settlements s
  on s.id = l.settlement_id;

revoke all on table public.operator_reward_recipient_b3tr_evidence
  from public, anon, authenticated;
grant select on table public.operator_reward_recipient_b3tr_evidence
  to service_role;

comment on view public.operator_reward_recipient_b3tr_evidence is
  'Operator-only immutable receipt/settlement evidence for B3TR recipient observation. payout_amount_wei is text to preserve numeric(78,0) precision across server JavaScript.';

create view public.operator_reward_recipient_b3tr_observation_due
with (security_invoker = true)
as
select
  e.receipt_id,
  e.settlement_id,
  e.network,
  e.invite_code,
  e.recipient_wallet,
  e.payout_amount_wei,
  e.payout_tx_id,
  e.paid_at,
  e.payout_block_number,
  (e.payout_block_number + 8640)::bigint as target_scan_to_block
from public.operator_reward_recipient_b3tr_evidence e
where e.chain_evidence_matches
  and e.paid_at <= now() - interval '24 hours'
  and not exists (
    select 1
    from public.reward_recipient_b3tr_flow_snapshots f
    where f.receipt_id = e.receipt_id
      and f.scan_to_block >= e.payout_block_number + 8640
  );

revoke all on table public.operator_reward_recipient_b3tr_observation_due
  from public, anon, authenticated;
grant select on table public.operator_reward_recipient_b3tr_observation_due
  to service_role;

comment on view public.operator_reward_recipient_b3tr_observation_due is
  'Operator-only queue of finalized, chain-consistent reward receipts due for one observation-only B3TR flow scan covering the first approximate 24 hours after payout. Existing snapshots at or beyond the target horizon suppress repeat work.';

commit;
