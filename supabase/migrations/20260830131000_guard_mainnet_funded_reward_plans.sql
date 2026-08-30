begin;

-- Defense-in-depth: when mainnet funded rewards are disabled, no new mainnet
-- financial plan may be created even if an operator route or service-role call
-- is invoked accidentally. Existing transaction submission/settlement records
-- remain writable so already-broadcast transactions can still be reconciled.
create or replace function public.guard_mainnet_funded_reward_plan_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  if lower(coalesce(new.network, '')) <> 'mainnet' then
    return new;
  end if;

  select mainnet_funded_rewards_enabled
  into v_enabled
  from public.reward_runtime_config
  where id = 1;

  if not found then
    raise exception 'VeInvite reward runtime configuration is missing';
  end if;

  if not v_enabled then
    raise exception 'VeInvite mainnet funded rewards are disabled';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_mainnet_funded_reward_plan_insert()
  from public, anon, authenticated;
grant execute on function public.guard_mainnet_funded_reward_plan_insert()
  to service_role;

create or replace trigger reward_budget_epochs_mainnet_funded_guard
before insert on public.reward_budget_epochs
for each row
execute function public.guard_mainnet_funded_reward_plan_insert();

create or replace trigger reward_rounds_mainnet_funded_guard
before insert on public.reward_rounds
for each row
execute function public.guard_mainnet_funded_reward_plan_insert();

create or replace trigger reward_manifests_mainnet_funded_guard
before insert on public.reward_payout_manifests
for each row
execute function public.guard_mainnet_funded_reward_plan_insert();

commit;
