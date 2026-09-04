begin;

-- At a VeBetter round boundary the new official allocation receipt can arrive
-- a little after an eligible user starts onboarding. Keep the invitation
-- unbound rather than assigning the wrong receipt; the allocation insert hook
-- below binds it automatically as soon as the exact previous-round receipt is
-- synchronized. Reward reservation remains fail-closed until binding exists.
create or replace function public.bind_invitation_reward_cohort()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_current_round_text text;
  v_current_round bigint;
  v_receipt public.vebetter_round_allocations%rowtype;
begin
  if tg_op = 'UPDATE'
     and old.reward_funding_allocation_receipt_id is not null
     and (
       new.reward_funding_allocation_receipt_id is distinct from old.reward_funding_allocation_receipt_id
       or new.reward_cohort_round_id is distinct from old.reward_cohort_round_id
     ) then
    raise exception 'REWARD_COHORT_BINDING_IMMUTABLE';
  end if;

  if new.activated_at is not null
     and new.activation_network is not null
     and new.eligibility_check_id is not null
     and new.reward_cohort_round_id is null
     and new.reward_funding_allocation_receipt_id is null then
    select e.details ->> 'currentRoundId'
    into v_current_round_text
    from public.eligibility_check_events e
    where e.id = new.eligibility_check_id
      and e.outcome = 'ELIGIBLE'
      and e.network = new.activation_network;

    if v_current_round_text is null
       or v_current_round_text !~ '^[0-9]+$'
       or v_current_round_text::numeric > 9223372036854775807 then
      if new.activation_network = 'mainnet' then
        raise exception 'REWARD_COHORT_ROUND_EVIDENCE_MISSING';
      end if;
      return new;
    end if;

    v_current_round := v_current_round_text::bigint;
    if v_current_round < 2 then
      if new.activation_network = 'mainnet' then
        raise exception 'REWARD_COHORT_ROUND_INVALID';
      end if;
      return new;
    end if;

    select * into v_receipt
    from public.vebetter_round_allocations a
    where a.network = new.activation_network
      and a.app_id = v_veinvite_app_id
      and a.vebetter_round_id = v_current_round - 1
    order by a.id desc
    limit 1;

    if found then
      new.reward_cohort_round_id := v_current_round;
      new.reward_funding_allocation_receipt_id := v_receipt.id;
    else
      -- Never guess or substitute the newest receipt. Both fields stay null
      -- until the exact funding evidence is synchronized.
      return new;
    end if;
  end if;

  if (new.reward_cohort_round_id is null) <> (new.reward_funding_allocation_receipt_id is null) then
    raise exception 'REWARD_COHORT_BINDING_INCOMPLETE';
  end if;

  if new.reward_funding_allocation_receipt_id is not null then
    select * into v_receipt
    from public.vebetter_round_allocations a
    where a.id = new.reward_funding_allocation_receipt_id;

    if not found
       or v_receipt.network <> new.activation_network
       or v_receipt.app_id <> v_veinvite_app_id
       or v_receipt.vebetter_round_id + 1 <> new.reward_cohort_round_id then
      raise exception 'REWARD_COHORT_BINDING_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.bind_invitation_reward_cohort()
  from public, anon, authenticated;
grant execute on function public.bind_invitation_reward_cohort()
  to service_role;

-- Bind any invitations that were deliberately left unbound during the short
-- receipt-sync window. The eligibility evidence determines the cohort; the new
-- allocation row is only accepted when it is exactly the previous round.
create or replace function public.bind_waiting_invitations_after_allocation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
begin
  if new.app_id <> v_veinvite_app_id then
    return new;
  end if;

  update public.invitations i
  set reward_cohort_round_id = new.vebetter_round_id + 1,
      reward_funding_allocation_receipt_id = new.id
  from public.eligibility_check_events e
  where i.eligibility_check_id = e.id
    and i.activation_network = new.network
    and i.activated_at is not null
    and i.reward_cohort_round_id is null
    and i.reward_funding_allocation_receipt_id is null
    and e.outcome = 'ELIGIBLE'
    and e.network = new.network
    and e.details ->> 'currentRoundId' = (new.vebetter_round_id + 1)::text;

  return new;
end;
$$;

revoke all on function public.bind_waiting_invitations_after_allocation()
  from public, anon, authenticated;
grant execute on function public.bind_waiting_invitations_after_allocation()
  to service_role;

drop trigger if exists vebetter_allocations_bind_waiting_cohorts
  on public.vebetter_round_allocations;
create trigger vebetter_allocations_bind_waiting_cohorts
after insert on public.vebetter_round_allocations
for each row execute function public.bind_waiting_invitations_after_allocation();

commit;
