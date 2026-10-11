create or replace function public.enforce_reward_queue_cohort_budget()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_invitation public.invitations%rowtype;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_budget numeric(78,0) := 0;
  v_committed numeric(78,0) := 0;
  v_delta numeric(78,0) := 0;
begin
  if new.reserved_amount_wei is null or new.status='CANCELLED' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_' || new.network,0)
  );

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found
     or v_invitation.reward_cohort_round_id is null
     or v_invitation.reward_funding_allocation_receipt_id is null then
    raise exception 'REWARD_COHORT_BINDING_REQUIRED';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id=v_invitation.reward_funding_allocation_receipt_id;

  if not found
     or v_receipt.network<>new.network
     or v_receipt.vebetter_round_id+1<>v_invitation.reward_cohort_round_id then
    raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
  end if;

  v_budget:=public.read_reward_cohort_effective_budget_wei(
    v_receipt.network,
    v_receipt.app_id,
    v_invitation.reward_cohort_round_id,
    v_receipt.id
  );

  -- Use the same cohort commitment authority as forecasting/reservation.
  -- It already accounts for recovery offsets and RELEASED X promotion value,
  -- preventing this final DB guard from diverging from planning.
  v_committed:=public.read_reward_cohort_committed_wei(
    v_receipt.network,
    v_receipt.app_id,
    v_invitation.reward_cohort_round_id,
    v_receipt.id
  );

  -- BEFORE INSERT: the new queue row is not yet part of v_committed.
  -- BEFORE UPDATE from CANCELLED: the row is likewise not committed yet.
  -- Updates among committed states are already represented in v_committed,
  -- so adding the reservation again would double-count the current row.
  if tg_op='INSERT' then
    v_delta:=new.reserved_amount_wei;
  elsif old.status='CANCELLED'
        and new.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED') then
    v_delta:=new.reserved_amount_wei;
  else
    v_delta:=0;
  end if;

  if v_committed+v_delta>v_budget then
    raise exception 'REWARD_COHORT_BUDGET_EXCEEDED';
  end if;

  return new;
end;
$function$;
