begin;

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
  );

revoke all on public.operator_sybil_v2_post_payout_candidates
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_post_payout_candidates
  to service_role;

comment on view public.operator_sybil_v2_post_payout_candidates is
  'Recovery queue for finalized B3TR recipient-flow snapshots that have not yet been bridged into Sybil v2 POST_PAYOUT evidence.';

commit;
