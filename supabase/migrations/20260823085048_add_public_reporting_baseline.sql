create table if not exists public.operator_reporting_config (
  id smallint primary key,
  reporting_start_at timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  constraint operator_reporting_config_singleton_check check (id = 1)
);

insert into public.operator_reporting_config (id, reporting_start_at, note)
values (1, null, 'Public weekly reporting is disabled until an explicit launch baseline is set.')
on conflict (id) do nothing;

alter table public.operator_reporting_config enable row level security;
revoke all on table public.operator_reporting_config from public, anon, authenticated;
grant select, update on table public.operator_reporting_config to service_role;

create or replace view public.operator_public_weekly_impact
with (security_invoker = true)
as
select w.*
from public.operator_weekly_impact w
cross join public.operator_reporting_config c
where c.id = 1
  and c.reporting_start_at is not null
  and w.week_start >= date_trunc('week', c.reporting_start_at)
  and w.week_start >= c.reporting_start_at;

revoke all on table public.operator_public_weekly_impact from public, anon, authenticated;
grant select on table public.operator_public_weekly_impact to service_role;