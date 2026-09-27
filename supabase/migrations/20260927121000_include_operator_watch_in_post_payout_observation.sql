begin;

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
    coalesce(
      c.verdict,
      case
        when a.source = 'OPERATOR'
         and a.state = 'WATCH'
         and a.policy_version = 'sybil-v2.1'
         and a.evidence_summary ->> 'postPayoutObservationEnabled' = 'true'
          then 'WATCH'
        else null
      end
    ) as sybil_v2_verdict,
    (
      a.source = 'OPERATOR'
      and a.state = 'WATCH'
      and a.policy_version = 'sybil-v2.1'
    ) as operator_historical_watch,
    coalesce(max(f.scan_to_block), s.block_number)::bigint
      as latest_scan_to_block
  from public.reward_recipient_audit_ledger l
  join public.reward_payout_transaction_settlements s
    on s.id = l.settlement_id
   and s.network = l.network
   and lower(s.tx_id) = lower(l.tx_id)
  left join public.sybil_v2_reward_clearances c
    on c.invite_code = l.invite_code
   and c.network = l.network
  left join public.sybil_v2_referral_assessments a
    on a.invite_code = l.invite_code
   and a.network = l.network
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
    c.verdict,
    a.source,
    a.state,
    a.policy_version
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
  and (
    s.paid_at >= r.sybil_v2_automatic_observation_started_at
    or s.operator_historical_watch is true
  );

revoke all on table public.operator_reward_recipient_b3tr_observation_due
  from public, anon, authenticated;
grant select on table public.operator_reward_recipient_b3tr_observation_due
  to service_role;

comment on view public.operator_reward_recipient_b3tr_observation_due is
  'Automatic finalized reward-recipient B3TR observation schedule. Payouts after the rollout boundary are eligible normally. Historical payouts remain excluded unless an operator explicitly records a sybil-v2.1 WATCH assessment and enables post-payout observation for that reviewed referral, in which case only that referral receives the staged 24h, 7d and 30d observation schedule.';

commit;
