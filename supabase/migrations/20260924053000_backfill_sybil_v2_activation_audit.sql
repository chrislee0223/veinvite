begin;

do $$
declare
  v_now timestamptz := clock_timestamp();
  v_enabled boolean;
  v_changed_at timestamptz;
  v_reason text;
  v_observation_started_at timestamptz;
begin
  select
    c.sybil_v2_enforcement_enabled,
    c.sybil_v2_enforcement_changed_at,
    c.sybil_v2_enforcement_reason,
    c.sybil_v2_automatic_observation_started_at
  into
    v_enabled,
    v_changed_at,
    v_reason,
    v_observation_started_at
  from public.reward_runtime_config c
  where c.id = 1
  for update;

  if not found then
    raise exception 'SYBIL_V2_RUNTIME_CONFIG_MISSING';
  end if;

  if v_enabled is false then
    update public.reward_runtime_config
    set
      sybil_v2_enforcement_enabled = true,
      sybil_v2_enforcement_changed_at = v_now,
      sybil_v2_enforcement_reason =
        coalesce(
          nullif(sybil_v2_enforcement_reason, ''),
          'FUTURE_ONLY_SYBIL_V2_ACTIVATION_AFTER_SHADOW_VALIDATION'
        ),
      sybil_v2_automatic_observation_started_at =
        coalesce(sybil_v2_automatic_observation_started_at, v_now)
    where id = 1
      and sybil_v2_enforcement_enabled is false;
  end if;

  select
    c.sybil_v2_enforcement_enabled,
    c.sybil_v2_enforcement_changed_at,
    c.sybil_v2_enforcement_reason,
    c.sybil_v2_automatic_observation_started_at
  into
    v_enabled,
    v_changed_at,
    v_reason,
    v_observation_started_at
  from public.reward_runtime_config c
  where c.id = 1;

  if v_enabled is not true
     or v_changed_at is null
     or v_observation_started_at is null
  then
    raise exception 'SYBIL_V2_ACTIVATION_AUDIT_PRECONDITION_FAILED';
  end if;

  insert into public.reward_runtime_config_events (
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
    sybil_v2_automatic_observation_started_at,
    recorded_at
  )
  select
    c.id,
    c.mainnet_funded_rewards_enabled,
    c.mainnet_funded_rewards_enabled,
    c.emergency_rewards_paused,
    c.emergency_rewards_paused,
    c.note,
    c.note,
    c.emergency_pause_changed_by,
    current_user,
    false,
    true,
    null,
    c.sybil_v2_enforcement_changed_at,
    null,
    c.sybil_v2_enforcement_reason,
    null,
    c.sybil_v2_automatic_observation_started_at,
    c.sybil_v2_enforcement_changed_at
  from public.reward_runtime_config c
  where c.id = 1
    and c.sybil_v2_enforcement_enabled is true
    and c.sybil_v2_enforcement_changed_at is not null
    and c.sybil_v2_automatic_observation_started_at is not null
    and not exists (
      select 1
      from public.reward_runtime_config_events e
      where e.config_id = c.id
        and e.sybil_v2_enforcement_enabled is true
        and e.sybil_v2_enforcement_changed_at =
          c.sybil_v2_enforcement_changed_at
        and e.sybil_v2_automatic_observation_started_at =
          c.sybil_v2_automatic_observation_started_at
    );
end;
$$;

comment on column public.reward_runtime_config.sybil_v2_enforcement_reason is
  'Audit note for the latest Sybil v2 enforcement toggle. Existing activation timestamps are preserved when historical activation audit evidence is backfilled.';

commit;
