create or replace function public.guard_reward_emergency_pause_audit_metadata()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.emergency_rewards_paused is distinct from old.emergency_rewards_paused then
    if new.emergency_pause_changed_by is null
       or new.emergency_pause_changed_by !~ '^0x[0-9a-f]{40}$' then
      raise exception 'emergency reward pause changes require a valid operator wallet';
    end if;

    if new.emergency_pause_reason is null
       or char_length(btrim(new.emergency_pause_reason)) < 12
       or char_length(btrim(new.emergency_pause_reason)) > 500 then
      raise exception 'emergency reward pause changes require a 12-500 character reason';
    end if;

    if new.emergency_pause_network is null
       or new.emergency_pause_network not in ('mainnet', 'testnet', 'testnet-staging') then
      raise exception 'emergency reward pause changes require a valid network';
    end if;

    if new.emergency_pause_changed_at is null then
      raise exception 'emergency reward pause changes require a change timestamp';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reward_runtime_config_emergency_pause_audit_guard
  on public.reward_runtime_config;

create trigger reward_runtime_config_emergency_pause_audit_guard
before update of emergency_rewards_paused
on public.reward_runtime_config
for each row
execute function public.guard_reward_emergency_pause_audit_metadata();

comment on function public.guard_reward_emergency_pause_audit_metadata() is
  'Requires complete operator, reason, network, and timestamp metadata whenever the emergency reward pause changes, preventing unaudited direct state mutations.';
