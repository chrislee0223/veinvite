begin;

do $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated integer := 0;
begin
  update public.reward_runtime_config
  set
    sybil_v2_enforcement_enabled = true,
    sybil_v2_enforcement_changed_at = v_now,
    sybil_v2_enforcement_reason =
      'Activated after shadow rollout, Production QA, and migration verification',
    sybil_v2_automatic_observation_started_at =
      coalesce(sybil_v2_automatic_observation_started_at, v_now)
  where id = 1
    and sybil_v2_enforcement_enabled is false;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    if not exists (
      select 1
      from public.reward_runtime_config c
      where c.id = 1
        and c.sybil_v2_enforcement_enabled is true
        and c.sybil_v2_automatic_observation_started_at is not null
    ) then
      raise exception 'SYBIL_V2_ACTIVATION_PRECONDITION_FAILED';
    end if;
  end if;
end;
$$;

comment on column public.reward_runtime_config.sybil_v2_enforcement_reason is
  'Audit note for the latest Sybil v2 enforcement toggle. The current activation was performed only after shadow-mode DB/code validation and CI gates passed.';

commit;
