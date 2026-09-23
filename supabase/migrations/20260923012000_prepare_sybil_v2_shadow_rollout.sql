begin;

alter table public.reward_runtime_config
  add column if not exists sybil_v2_enforcement_enabled boolean not null default false;

comment on column public.reward_runtime_config.sybil_v2_enforcement_enabled is
  'Rollout gate for Sybil Pipeline v2. FALSE = shadow analysis only; existing reward/participation behavior remains authoritative. TRUE = v2 clearance/HOLD/restriction gates become enforceable.';

create or replace function public.sybil_v2_enforcement_enabled()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select c.sybil_v2_enforcement_enabled
      from public.reward_runtime_config c
      where c.id = 1
    ),
    false
  );
$$;

revoke all on function public.sybil_v2_enforcement_enabled()
  from public, anon, authenticated;
grant execute on function public.sybil_v2_enforcement_enabled()
  to service_role;

commit;
