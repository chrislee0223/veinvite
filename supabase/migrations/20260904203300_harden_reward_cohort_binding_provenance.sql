begin;

alter table public.invitations
  add column if not exists reward_cohort_binding_source text;

update public.invitations i
set reward_cohort_binding_source = case
  when e.details ->> 'currentRoundId' = i.reward_cohort_round_id::text
    then 'ROUND_MATCH'
  when i.activation_network = 'mainnet'
    and i.reward_cohort_round_id = 114
    and e.details ->> 'currentRoundId' = '113'
    then 'BOOTSTRAP_CARRY_FORWARD'
  else null
end
from public.eligibility_check_events e
where e.id = i.eligibility_check_id
  and i.reward_cohort_round_id is not null
  and i.reward_funding_allocation_receipt_id is not null
  and i.reward_cohort_binding_source is null;

do $$
begin
  if exists (
    select 1 from public.invitations i
    where i.reward_cohort_round_id is not null
      and i.reward_funding_allocation_receipt_id is not null
      and i.reward_cohort_binding_source is null
  ) then
    raise exception 'REWARD_COHORT_BINDING_SOURCE_BACKFILL_INCOMPLETE';
  end if;
end;
$$;

alter table public.invitations
  drop constraint if exists invitations_reward_cohort_binding_check;
alter table public.invitations
  add constraint invitations_reward_cohort_binding_check check (
    (reward_cohort_round_id is null
      and reward_funding_allocation_receipt_id is null
      and reward_cohort_binding_source is null)
    or
    (reward_cohort_round_id is not null
      and reward_cohort_round_id >= 1
      and reward_funding_allocation_receipt_id is not null
      and reward_cohort_binding_source in ('ROUND_MATCH','BOOTSTRAP_CARRY_FORWARD'))
  );

create or replace function public.set_reward_cohort_binding_source()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_round text;
begin
  if tg_op = 'UPDATE'
     and old.reward_cohort_binding_source is not null
     and new.reward_cohort_binding_source is distinct from old.reward_cohort_binding_source then
    raise exception 'REWARD_COHORT_BINDING_SOURCE_IMMUTABLE';
  end if;

  if new.reward_cohort_round_id is null
     or new.reward_funding_allocation_receipt_id is null then
    new.reward_cohort_binding_source := null;
    return new;
  end if;

  if new.reward_cohort_binding_source is not null then
    return new;
  end if;

  select e.details ->> 'currentRoundId'
  into v_current_round
  from public.eligibility_check_events e
  where e.id = new.eligibility_check_id
    and e.outcome = 'ELIGIBLE'
    and e.network = new.activation_network;

  if v_current_round = new.reward_cohort_round_id::text then
    new.reward_cohort_binding_source := 'ROUND_MATCH';
  elsif new.activation_network = 'mainnet'
     and new.reward_cohort_round_id = 114
     and v_current_round = '113' then
    new.reward_cohort_binding_source := 'BOOTSTRAP_CARRY_FORWARD';
  else
    raise exception 'REWARD_COHORT_BINDING_SOURCE_EVIDENCE_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function public.set_reward_cohort_binding_source()
  from public, anon, authenticated;
grant execute on function public.set_reward_cohort_binding_source() to service_role;

drop trigger if exists aa_invitations_bind_reward_cohort on public.invitations;
create trigger aa_invitations_bind_reward_cohort
before insert or update of activated_at, activation_network, eligibility_check_id,
  reward_cohort_round_id, reward_funding_allocation_receipt_id
on public.invitations
for each row execute function public.bind_invitation_reward_cohort();

drop trigger if exists zz_invitations_set_reward_cohort_binding_source on public.invitations;
create trigger zz_invitations_set_reward_cohort_binding_source
before insert or update of activated_at, activation_network, eligibility_check_id,
  reward_cohort_round_id, reward_funding_allocation_receipt_id,
  reward_cohort_binding_source
on public.invitations
for each row execute function public.set_reward_cohort_binding_source();

commit;
