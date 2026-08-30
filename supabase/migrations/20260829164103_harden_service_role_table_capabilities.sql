begin;

-- Runtime code should never be able to wipe an entire application table,
-- create triggers, or add foreign-key references. Preserve only the row-level
-- privileges explicitly required by server operations.
do $$
declare
  r record;
begin
  for r in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
  loop
    execute format(
      'revoke truncate, references, trigger on table public.%I from service_role',
      r.table_name
    );
  end loop;
end;
$$;

-- Prevent future postgres-owned migrations from automatically restoring these
-- capabilities on newly created public tables.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from service_role;

commit;
