begin;

-- Cohort funding is a lifetime budget, not merely an unsettled-liability cap.
-- Once a fixed reservation is created it permanently consumes this cohort's
-- designated funding, even after the transfer is PAID. Otherwise a later batch
-- could reuse already-spent cohort budget.
create or replace function public.read_reward_cohort_committed_wei(
  p_network text,
  p_app_id text,
  p_reward_cohort_round_id bigint,
  p_allocation_receipt_id bigint
)
returns numeric
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_committed numeric(78,0) := 0;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_reward_cohort_round_id is null or p_reward_cohort_round_id < 1 then
    raise exception 'invalid reward cohort round';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id = p_allocation_receipt_id
    and a.network = p_network
    and a.app_id = p_app_id;

  if not found
     or v_receipt.vebetter_round_id + 1 <> p_reward_cohort_round_id then
    raise exception 'allocation receipt does not fund the requested reward cohort';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_committed
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code = q.invite_code
  where q.network = p_network
    and i.reward_funding_allocation_receipt_id = v_receipt.id
    and i.reward_cohort_round_id = p_reward_cohort_round_id
    and q.reserved_amount_wei is not null;

  return v_committed;
end;
$$;

revoke all on function public.read_reward_cohort_committed_wei(text,text,bigint,bigint)
  from public, anon, authenticated;
grant execute on function public.read_reward_cohort_committed_wei(text,text,bigint,bigint)
  to service_role;

create or replace function public.enforce_reward_queue_cohort_budget()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invitation public.invitations%rowtype;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_adjustment numeric(78,0) := 0;
  v_existing numeric(78,0) := 0;
  v_budget numeric(78,0) := 0;
begin
  if new.reserved_amount_wei is null then return new; end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code = new.invite_code;

  if not found
     or v_invitation.reward_cohort_round_id is null
     or v_invitation.reward_funding_allocation_receipt_id is null then
    raise exception 'REWARD_COHORT_BINDING_REQUIRED';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id = v_invitation.reward_funding_allocation_receipt_id;

  if not found
     or v_receipt.network <> new.network
     or v_receipt.vebetter_round_id + 1 <> v_invitation.reward_cohort_round_id then
    raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
  end if;

  select coalesce(sum(a.amount_wei),0)
  into v_adjustment
  from public.reward_cohort_funding_adjustments a
  where a.network = v_receipt.network
    and a.app_id = v_receipt.app_id
    and a.reward_cohort_round_id = v_invitation.reward_cohort_round_id
    and a.allocation_receipt_id = v_receipt.id;

  v_budget := v_receipt.rewards_allocation_amount_wei + v_adjustment;

  -- Count every prior immutable reservation, including already-paid entries.
  select coalesce(sum(q.reserved_amount_wei),0)
  into v_existing
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code = q.invite_code
  where q.network = new.network
    and i.reward_funding_allocation_receipt_id = v_receipt.id
    and i.reward_cohort_round_id = v_invitation.reward_cohort_round_id
    and q.invite_code <> new.invite_code
    and q.reserved_amount_wei is not null;

  if v_existing + new.reserved_amount_wei > v_budget then
    raise exception 'REWARD_COHORT_BUDGET_EXCEEDED';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_reward_queue_cohort_budget()
  from public, anon, authenticated;
grant execute on function public.enforce_reward_queue_cohort_budget()
  to service_role;

commit;
