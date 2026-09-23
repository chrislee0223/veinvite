begin;

alter table public.reward_runtime_config_events
  add column if not exists previous_sybil_v2_enforcement_enabled boolean,
  add column if not exists sybil_v2_enforcement_enabled boolean,
  add column if not exists previous_sybil_v2_enforcement_changed_at timestamptz,
  add column if not exists sybil_v2_enforcement_changed_at timestamptz,
  add column if not exists previous_sybil_v2_enforcement_reason text,
  add column if not exists sybil_v2_enforcement_reason text,
  add column if not exists previous_sybil_v2_automatic_observation_started_at timestamptz,
  add column if not exists sybil_v2_automatic_observation_started_at timestamptz;

create or replace function public.log_reward_runtime_config_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.mainnet_funded_rewards_enabled is distinct from old.mainnet_funded_rewards_enabled
     or new.emergency_rewards_paused is distinct from old.emergency_rewards_paused
     or new.note is distinct from old.note
     or new.emergency_pause_changed_by is distinct from old.emergency_pause_changed_by
     or new.sybil_v2_enforcement_enabled is distinct from old.sybil_v2_enforcement_enabled
     or new.sybil_v2_enforcement_changed_at is distinct from old.sybil_v2_enforcement_changed_at
     or new.sybil_v2_enforcement_reason is distinct from old.sybil_v2_enforcement_reason
     or new.sybil_v2_automatic_observation_started_at is distinct from old.sybil_v2_automatic_observation_started_at
  then
    insert into public.reward_runtime_config_events(
      config_id,
      previous_mainnet_funded_rewards_enabled,
      mainnet_funded_rewards_enabled,
      previous_emergency_rewards_paused,
      emergency_rewards_paused,
      previous_note,
      note,
      emergency_pause_changed_by,
      database_actor,
      previous_sybil_v2_enforcement_enabled,
      sybil_v2_enforcement_enabled,
      previous_sybil_v2_enforcement_changed_at,
      sybil_v2_enforcement_changed_at,
      previous_sybil_v2_enforcement_reason,
      sybil_v2_enforcement_reason,
      previous_sybil_v2_automatic_observation_started_at,
      sybil_v2_automatic_observation_started_at
    ) values (
      new.id,
      old.mainnet_funded_rewards_enabled,
      new.mainnet_funded_rewards_enabled,
      old.emergency_rewards_paused,
      new.emergency_rewards_paused,
      old.note,
      new.note,
      new.emergency_pause_changed_by,
      current_user,
      old.sybil_v2_enforcement_enabled,
      new.sybil_v2_enforcement_enabled,
      old.sybil_v2_enforcement_changed_at,
      new.sybil_v2_enforcement_changed_at,
      old.sybil_v2_enforcement_reason,
      new.sybil_v2_enforcement_reason,
      old.sybil_v2_automatic_observation_started_at,
      new.sybil_v2_automatic_observation_started_at
    );
  end if;

  return new;
end;
$$;

drop trigger if exists reward_runtime_config_audit
  on public.reward_runtime_config;

create trigger reward_runtime_config_audit
after update of
  mainnet_funded_rewards_enabled,
  emergency_rewards_paused,
  note,
  emergency_pause_changed_by,
  sybil_v2_enforcement_enabled,
  sybil_v2_enforcement_changed_at,
  sybil_v2_enforcement_reason,
  sybil_v2_automatic_observation_started_at
on public.reward_runtime_config
for each row execute function public.log_reward_runtime_config_event();

comment on function public.log_reward_runtime_config_event() is
  'Append-only audit logger for reward runtime configuration, including Sybil v2 enforcement and automatic post-payout observation rollout changes.';

commit;
