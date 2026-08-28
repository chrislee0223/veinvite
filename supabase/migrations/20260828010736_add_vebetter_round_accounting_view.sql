begin;

create or replace view public.operator_vebetter_round_accounting
with (security_invoker = true)
as
with paid as (
  select
    rr.allocation_receipt_id,
    count(*) filter (
      where rp.status = 'PAID' and rp.paid_at is not null
    ) as paid_referral_rewards,
    count(distinct rp.recipient_wallet) filter (
      where rp.status = 'PAID' and rp.paid_at is not null
    ) as rewarded_inviters,
    coalesce(sum(rp.amount_wei) filter (
      where rp.status = 'PAID' and rp.paid_at is not null
    ), 0) as paid_b3tr_wei
  from public.reward_rounds rr
  left join public.reward_payouts rp
    on rp.round_id = rr.id
  where rr.allocation_receipt_id is not null
  group by rr.allocation_receipt_id
)
select
  a.id as allocation_receipt_id,
  a.network,
  a.app_id,
  a.vebetter_round_id,
  a.claim_tx_id,
  a.claim_block_number,
  a.claim_block_timestamp,
  a.total_amount_wei as total_app_allocation_wei,
  a.team_allocation_amount_wei,
  a.rewards_allocation_amount_wei as reward_pool_allocation_wei,
  a.unallocated_amount_wei,
  a.total_amount_wei / 1000000000000000000::numeric
    as total_app_allocation_b3tr,
  a.team_allocation_amount_wei / 1000000000000000000::numeric
    as team_allocation_b3tr,
  a.rewards_allocation_amount_wei / 1000000000000000000::numeric
    as reward_pool_allocation_b3tr,
  rr.id as reward_round_id,
  rr.status as reward_round_status,
  rr.opening_carryover_wei,
  rr.observed_pool_balance_wei,
  rr.reserved_before_round_wei,
  rr.distributable_wei,
  rr.eligible_count,
  rr.per_reward_wei,
  rr.remainder_wei as closing_carryover_wei,
  rr.created_at as reward_round_created_at,
  rr.completed_at as reward_round_completed_at,
  coalesce(p.paid_referral_rewards, 0)::bigint
    as paid_referral_rewards,
  coalesce(p.rewarded_inviters, 0)::bigint
    as rewarded_inviters,
  coalesce(p.paid_b3tr_wei, 0)::numeric
    as paid_b3tr_wei,
  coalesce(p.paid_b3tr_wei, 0)::numeric /
    1000000000000000000::numeric as paid_b3tr,
  case
    when rr.id is null then 'ALLOCATED_NOT_PREPARED'
    when rr.status = 'COMPLETED'
      and coalesce(p.paid_referral_rewards, 0) = rr.eligible_count
      and coalesce(p.paid_b3tr_wei, 0) = rr.distributable_wei
      then 'SETTLED'
    else rr.status
  end as accounting_status,
  a.observed_at
from public.vebetter_round_allocations a
left join public.reward_rounds rr
  on rr.allocation_receipt_id = a.id
left join paid p
  on p.allocation_receipt_id = a.id
order by a.vebetter_round_id desc;

revoke all on public.operator_vebetter_round_accounting
  from public, anon, authenticated;
grant select on public.operator_vebetter_round_accounting
  to service_role;

commit;
