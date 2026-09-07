begin;

-- Exact Production alignment migration applied on 2026-09-07.
-- Keep destructive analytics cleanup inaccessible to normal server code until
-- physical Archive storage and restore verification are explicitly activated.
revoke execute on function public.compact_app_usage_analytics(integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.compact_app_product_analytics(integer)
  from public, anon, authenticated, service_role;

grant execute on function public.compact_app_usage_analytics(integer) to postgres;
grant execute on function public.compact_app_product_analytics(integer) to postgres;

comment on function public.compact_app_usage_analytics(integer) is
  'Destructive raw usage cleanup. Execution is intentionally postgres-only until physical Archive storage and restore verification are explicitly activated by a future reviewed migration.';
comment on function public.compact_app_product_analytics(integer) is
  'Destructive raw product cleanup. Execution is intentionally postgres-only until physical Archive storage and restore verification are explicitly activated by a future migration.';

commit;
