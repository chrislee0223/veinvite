-- Prevent overlapping background/manual reconciliation workers.
-- A crashed worker releases itself automatically when the short lease expires.

begin;

create table if not exists public.operator_runtime_locks (
  lock_name text primary key,
  owner_token text not null,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint operator_runtime_locks_name_check
    check (length(lock_name) between 3 and 128),
  constraint operator_runtime_locks_owner_check
    check (length(owner_token) between 16 and 128)
);

alter table public.operator_runtime_locks enable row level security;
revoke all on public.operator_runtime_locks from public, anon, authenticated;

create or replace function public.try_acquire_operator_lock(
  p_lock_name text,
  p_owner_token text,
  p_lease_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acquired boolean := false;
begin
  if p_lock_name is null or length(btrim(p_lock_name)) not between 3 and 128 then
    raise exception 'invalid lock name';
  end if;
  if p_owner_token is null or length(btrim(p_owner_token)) not between 16 and 128 then
    raise exception 'invalid owner token';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 1800 then
    raise exception 'lease seconds must be between 30 and 1800';
  end if;

  insert into public.operator_runtime_locks(
    lock_name,
    owner_token,
    locked_until,
    updated_at
  ) values (
    btrim(p_lock_name),
    btrim(p_owner_token),
    now() + make_interval(secs => p_lease_seconds),
    now()
  )
  on conflict (lock_name) do update
  set owner_token = excluded.owner_token,
      locked_until = excluded.locked_until,
      updated_at = now()
  where public.operator_runtime_locks.locked_until <= now()
     or public.operator_runtime_locks.owner_token = excluded.owner_token
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_operator_lock(
  p_lock_name text,
  p_owner_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released boolean := false;
begin
  delete from public.operator_runtime_locks
  where lock_name = btrim(p_lock_name)
    and owner_token = btrim(p_owner_token)
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function public.try_acquire_operator_lock(text,text,integer)
  from public, anon, authenticated;
revoke all on function public.release_operator_lock(text,text)
  from public, anon, authenticated;
grant execute on function public.try_acquire_operator_lock(text,text,integer)
  to service_role;
grant execute on function public.release_operator_lock(text,text)
  to service_role;

commit;
