do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as function_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'apply_sybil_v2_behavior_pattern_%'
      and p.prosecdef = true
      and p.proname <> 'apply_sybil_v2_behavior_pattern_restriction'
  loop
    execute format(
      'drop function if exists %I.%I(%s)',
      r.schema_name,
      r.function_name,
      r.function_args
    );
  end loop;
end
$$;
