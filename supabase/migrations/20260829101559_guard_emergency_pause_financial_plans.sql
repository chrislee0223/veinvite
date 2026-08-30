begin;

create or replace function public.guard_emergency_reward_plan_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paused boolean;
begin
  select emergency_rewards_paused
  into v_paused
  from public.reward_runtime_config
  where id = 1;

  if not found then
    raise exception 'VeInvite reward runtime configuration is missing';
  end if;

  if v_paused then
    raise exception 'VeInvite emergency reward pause is active';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_emergency_reward_plan_insert()
  from public, anon, authenticated;

create or replace trigger reward_rounds_emergency_pause_guard
before insert on public.reward_rounds
for each row
execute function public.guard_emergency_reward_plan_insert();

create or replace trigger reward_manifests_emergency_pause_guard
before insert on public.reward_payout_manifests
for each row
execute function public.guard_emergency_reward_plan_insert();

commit;
