create or replace function public.guard_mainnet_funded_rewards_one_way()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.mainnet_funded_rewards_enabled = true
     and new.mainnet_funded_rewards_enabled = false then
    raise exception 'mainnet funded rewards cannot be disabled after activation; use the emergency reward pause instead';
  end if;

  return new;
end;
$$;

drop trigger if exists reward_runtime_config_funded_one_way
  on public.reward_runtime_config;

create trigger reward_runtime_config_funded_one_way
before update of mainnet_funded_rewards_enabled
on public.reward_runtime_config
for each row
execute function public.guard_mainnet_funded_rewards_one_way();

comment on function public.guard_mainnet_funded_rewards_one_way() is
  'Prevents the production funded-reward activation flag from reverting from true to false. Operational payout stops must use the audited emergency reward pause instead.';
