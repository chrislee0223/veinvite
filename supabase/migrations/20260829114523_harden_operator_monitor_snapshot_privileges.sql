revoke update, delete, truncate, references, trigger, maintain
on table public.operator_monitor_snapshots
from service_role;

grant select, insert
on table public.operator_monitor_snapshots
to service_role;

create or replace function public.prevent_operator_monitor_snapshot_truncate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Operator monitor snapshots are append-only and cannot be truncated.';
end;
$$;

revoke all on function public.prevent_operator_monitor_snapshot_truncate()
from public, anon, authenticated, service_role;

drop trigger if exists operator_monitor_snapshots_prevent_truncate
on public.operator_monitor_snapshots;

create trigger operator_monitor_snapshots_prevent_truncate
before truncate on public.operator_monitor_snapshots
for each statement execute function public.prevent_operator_monitor_snapshot_truncate();
