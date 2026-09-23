begin;

create or replace view public.operator_reward_recipient_b3tr_observation_due
with (security_invoker = true)
as
with base as (
  select
    l.receipt_id,
    l.settlement_id,
    l.network,
    l.invite_code,
    l.recipient_wallet,
    l.amount_wei::text as payout_amount_wei,
    l.tx_id as payout_tx_id,
    l.paid_at,
    s.block_number as payout_block_number,
    c.verdict as sybil_v2_verdict,
    coalesce(max(f.scan_to_block), s.block_number)::bigint as latest_scan_to_block
  from public.reward_recipient_audit_ledger l
  join public.reward_payout_transaction_settlements s
    on s.id = l.settlement_id
   and s.network = l.network
   and lower(s.tx_id) = lower(l.tx_id)
  left join public.sybil_v2_reward_clearances c
    on c.invite_code = l.invite_code
   and c.network = l.network
  left join public.reward_recipient_b3tr_flow_snapshots f
    on f.receipt_id = l.receipt_id
  group by
    l.receipt_id,
    l.settlement_id,
    l.network,
    l.invite_code,
    l.recipient_wallet,
    l.amount_wei,
    l.tx_id,
    l.paid_at,
    s.block_number,
    c.verdict
), staged as (
  select
    b.*,
    case
      when b.paid_at <= now() - interval '24 hours'
       and b.latest_scan_to_block < b.payout_block_number + 8640
        then b.payout_block_number + 8640
      when b.sybil_v2_verdict = 'WATCH'
       and b.paid_at <= now() - interval '7 days'
       and b.latest_scan_to_block < b.payout_block_number + 60480
        then b.payout_block_number + 60480
      when b.sybil_v2_verdict = 'WATCH'
       and b.paid_at <= now() - interval '30 days'
       and b.latest_scan_to_block < b.payout_block_number + 259200
        then b.payout_block_number + 259200
      else null
    end::bigint as target_scan_to_block
  from base b
)
select
  receipt_id,
  settlement_id,
  network,
  invite_code,
  recipient_wallet,
  payout_amount_wei,
  payout_tx_id,
  paid_at,
  payout_block_number,
  target_scan_to_block
from staged
where target_scan_to_block is not null;

revoke all on table public.operator_reward_recipient_b3tr_observation_due
  from public, anon, authenticated;
grant select on table public.operator_reward_recipient_b3tr_observation_due
  to service_role;

comment on view public.operator_reward_recipient_b3tr_observation_due is
  'Finalized reward-recipient B3TR observation schedule. Every paid referral receives a 24h scan; Sybil v2 WATCH clearances additionally receive 7d and 30d scans without changing the already-paid reward.';

create or replace view public.operator_sybil_v2_post_payout_candidates
with (security_invoker = true)
as
select
  f.id as snapshot_id,
  f.receipt_id,
  l.invite_code,
  f.network,
  f.recipient_wallet,
  f.payout_tx_id,
  f.payout_block_number,
  f.scan_to_block,
  f.first_outbound_destination,
  f.dominant_destination,
  f.shared_destination_recipient_count,
  f.known_protocol_destination,
  f.indicators,
  f.checked_at
from public.reward_recipient_b3tr_flow_snapshots f
join public.reward_recipient_audit_ledger l
  on l.receipt_id = f.receipt_id
 and l.network = f.network
 and lower(l.recipient_wallet) = lower(f.recipient_wallet)
where f.observation_only is true
  and not exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = l.invite_code
      and e.network = f.network
      and e.evidence_family = 'POST_PAYOUT'
      and e.signal_code = 'POST_PAYOUT_OBSERVATION_COMPLETE'
      and e.evidence ->> 'receiptId' = f.receipt_id::text
      and e.evidence ->> 'scanToBlock' = f.scan_to_block::text
  );

revoke all on public.operator_sybil_v2_post_payout_candidates
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_post_payout_candidates
  to service_role;

comment on view public.operator_sybil_v2_post_payout_candidates is
  'Recovery queue for each finalized B3TR flow snapshot/horizon not yet bridged into Sybil v2 POST_PAYOUT evidence.';

commit;
