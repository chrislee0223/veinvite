begin;

create or replace function public.read_next_claimed_reward_cohort(
  p_network text,
  p_app_id text
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'rewardCohortRoundId',i.reward_cohort_round_id,
    'allocationReceiptId',i.reward_funding_allocation_receipt_id
  )
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code = q.invite_code
  join public.vebetter_round_allocations a
    on a.id = i.reward_funding_allocation_receipt_id
  where q.network = lower(btrim(p_network))
    and a.network = q.network
    and a.app_id = lower(btrim(p_app_id))
    and q.status = 'QUEUED'
    and q.assigned_round_id is null
    and q.claim_requested_at is not null
    and q.claim_requested_by_wallet = q.recipient_wallet
    and q.reserved_amount_wei is not null
    and q.reserved_amount_wei > 0
    and q.reserved_at is not null
    and i.status = 'COMPLETED'
    and i.reward_status = 'ELIGIBLE'
    and i.sybil_status = 'CLEAR'
    and lower(i.inviter_wallet) = q.recipient_wallet
    and i.reward_cohort_round_id is not null
    and i.reward_funding_allocation_receipt_id is not null
    and not exists (
      select 1 from public.reward_payouts rp
      where rp.invite_code = q.invite_code
    )
  order by q.claim_requested_at,q.invite_code
  limit 1;
$$;

revoke all on function public.read_next_claimed_reward_cohort(text,text)
  from public, anon, authenticated;
grant execute on function public.read_next_claimed_reward_cohort(text,text)
  to service_role;

commit;
