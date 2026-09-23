begin;

alter table public.reward_runtime_config
  add column if not exists sybil_v2_automatic_observation_started_at timestamptz;

comment on column public.reward_runtime_config.sybil_v2_automatic_observation_started_at is
  'First timestamp eligible for automatic Sybil v2 post-payout B3TR observation. Historical paid rewards before this boundary are intentionally excluded from the automatic scheduler and remain available for separate operator backfill.';

create or replace view public.operator_reward_recipient_b3tr_observation_due
with (security_invoker = true)
as
with rollout as (
  select
    c.sybil_v2_enforcement_enabled,
    c.sybil_v2_automatic_observation_started_at
  from public.reward_runtime_config c
  where c.id = 1
), base as (
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
  s.receipt_id,
  s.settlement_id,
  s.network,
  s.invite_code,
  s.recipient_wallet,
  s.payout_amount_wei,
  s.payout_tx_id,
  s.paid_at,
  s.payout_block_number,
  s.target_scan_to_block
from staged s
cross join rollout r
where s.target_scan_to_block is not null
  and r.sybil_v2_enforcement_enabled is true
  and r.sybil_v2_automatic_observation_started_at is not null
  and s.paid_at >= r.sybil_v2_automatic_observation_started_at;

revoke all on table public.operator_reward_recipient_b3tr_observation_due
  from public, anon, authenticated;
grant select on table public.operator_reward_recipient_b3tr_observation_due
  to service_role;

comment on view public.operator_reward_recipient_b3tr_observation_due is
  'Automatic finalized reward-recipient B3TR observation schedule. Only payouts created after the explicit Sybil v2 automatic-observation activation boundary are scheduled. Historical paid rewards are excluded for separate operator-controlled backfill. Every eligible payout receives a 24h scan; WATCH clearances additionally receive 7d and 30d scans.';

commit;
