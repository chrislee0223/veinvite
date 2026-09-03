-- Keep operator_runtime_locks direct-access restricted while allowing scheduled
-- housekeeping to remove only leases that have been expired for more than one
-- hour. The fixed cutoff is intentional: callers cannot supply a future
-- timestamp that could delete an active lease.

create or replace function public.cleanup_expired_operator_runtime_locks()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint := 0;
begin
  delete from public.operator_runtime_locks
  where locked_until < now() - interval '1 hour';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_operator_runtime_locks()
from public, anon, authenticated;

grant execute on function public.cleanup_expired_operator_runtime_locks()
to service_role;
