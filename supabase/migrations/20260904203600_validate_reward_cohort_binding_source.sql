begin;

create or replace function public.set_reward_cohort_binding_source()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_round text;
  v_expected_source text;
begin
  if new.reward_cohort_round_id is null
     or new.reward_funding_allocation_receipt_id is null then
    if new.reward_cohort_binding_source is not null then
      raise exception 'REWARD_COHORT_BINDING_SOURCE_WITHOUT_BINDING';
    end if;
    return new;
  end if;

  select e.details ->> 'currentRoundId'
  into v_current_round
  from public.eligibility_check_events e
  where e.id = new.eligibility_check_id
    and e.outcome = 'ELIGIBLE'
    and e.network = new.activation_network;

  if v_current_round = new.reward_cohort_round_id::text then
    v_expected_source := 'ROUND_MATCH';
  elsif new.activation_network = 'mainnet'
     and new.reward_cohort_round_id = 114
     and v_current_round = '113' then
    v_expected_source := 'BOOTSTRAP_CARRY_FORWARD';
  else
    raise exception 'REWARD_COHORT_BINDING_SOURCE_EVIDENCE_MISMATCH';
  end if;

  if new.reward_cohort_binding_source is null then
    new.reward_cohort_binding_source := v_expected_source;
  elsif new.reward_cohort_binding_source <> v_expected_source then
    raise exception 'REWARD_COHORT_BINDING_SOURCE_EVIDENCE_MISMATCH';
  end if;

  if tg_op = 'UPDATE'
     and old.reward_cohort_binding_source is not null
     and new.reward_cohort_binding_source is distinct from old.reward_cohort_binding_source then
    raise exception 'REWARD_COHORT_BINDING_SOURCE_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function public.set_reward_cohort_binding_source()
  from public, anon, authenticated;
grant execute on function public.set_reward_cohort_binding_source()
  to service_role;

commit;
