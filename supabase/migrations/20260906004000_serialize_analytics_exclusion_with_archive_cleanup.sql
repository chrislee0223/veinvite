-- Serialize the rare destructive archive cleanup path with administrator
-- analytics exclusion. This prevents a cleanup transaction from deleting the
-- last session while a concurrent exclusion transaction is about to persist an
-- otherwise orphaned daily visitor exclusion marker.

create or replace function public.exclude_app_usage_visitor(p_visitor_key text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_inserted boolean := false;
  v_row record;
  v_day date;
  v_affected_days date[] := '{}'::date[];
  v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
begin
  if p_visitor_key !~ '^[0-9a-f]{64}$' then
    raise exception 'visitor key is malformed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('veinvite_analytics_exclusion_archive_cleanup', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_visitor_key, 0)
  );

  select coalesce(array_agg(d.usage_date order by d.usage_date), '{}'::date[])
    into v_affected_days
  from (
    select distinct (s.started_at at time zone 'Asia/Seoul')::date as usage_date
    from public.app_usage_sessions s
    where s.visitor_key = p_visitor_key
      and (s.started_at at time zone 'Asia/Seoul')::date < v_today
    union
    select distinct e.usage_date
    from public.app_product_events e
    where e.visitor_key = p_visitor_key
      and e.usage_date < v_today
  ) d;

  insert into public.app_usage_excluded_visitors(visitor_key, excluded_at, reason)
  values(p_visitor_key, clock_timestamp(), 'ADMIN_WALLET')
  on conflict(visitor_key) do nothing;
  v_inserted := found;

  for v_row in
    select usage_date, view_name, sum(view_count)::bigint as view_count
    from public.app_usage_session_view_counts
    where visitor_key = p_visitor_key
    group by usage_date, view_name
  loop
    update public.app_usage_daily_view_counts d
    set view_count = greatest(0::bigint, d.view_count - v_row.view_count)
    where d.usage_date = v_row.usage_date
      and d.view_name = v_row.view_name;
  end loop;

  delete from public.app_usage_session_view_counts
  where visitor_key = p_visitor_key;

  delete from public.app_product_events
  where visitor_key = p_visitor_key;

  foreach v_day in array v_affected_days loop
    perform public.finalize_app_usage_analytics_day(v_day);
    perform public.finalize_app_product_analytics_day(v_day);
    perform public.finalize_veinvite_daily_funnel_day(v_day);
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.exclude_app_usage_visitor(text)
  from public, anon, authenticated;
grant execute on function public.exclude_app_usage_visitor(text)
  to service_role;

create or replace function public.compact_app_product_analytics(p_retention_days integer default null)
returns table(compacted_days integer, events_deleted bigint)
language plpgsql
set search_path = public
as $$
declare
  v_policy_days integer;
  v_retention_days integer;
  v_cutoff date;
  v_day date;
  v_deleted bigint := 0;
  v_manifest_id bigint;
  v_archived_count bigint;
begin
  select p.hot_retention_days into v_policy_days
  from public.veinvite_retention_policy_versions p
  where p.dataset_key = 'app_product_events'
    and p.effective_from <= clock_timestamp()
  order by p.effective_from desc, p.created_at desc
  limit 1;

  if v_policy_days is null then
    raise exception 'product analytics cleanup blocked: active retention policy is missing';
  end if;

  v_retention_days := coalesce(p_retention_days, v_policy_days);
  if v_retention_days < v_policy_days or v_retention_days > 3650 then
    raise exception 'product analytics retention days must be between active policy minimum % and 3650', v_policy_days;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('veinvite_analytics_exclusion_archive_cleanup', 0)
  );
  perform set_config('lock_timeout', '5s', true);
  lock table public.app_usage_sessions in share row exclusive mode;
  lock table public.app_product_events in share row exclusive mode;

  v_cutoff := (clock_timestamp() at time zone 'Asia/Seoul')::date - v_retention_days;

  select min(e.usage_date) into v_day
  from public.app_product_events e
  where e.usage_date <= v_cutoff;

  if v_day is null then
    return query select 0, 0::bigint;
    return;
  end if;

  v_manifest_id := public.current_verified_analytics_archive_manifest_id(
    'app_product_events', v_day
  );
  if v_manifest_id is null then
    raise exception 'raw product analytics cleanup blocked: % does not have a current VERIFIED one-day archive manifest', v_day;
  end if;

  select source_row_count into v_archived_count
  from public.veinvite_archive_manifests
  where id = v_manifest_id;

  perform public.finalize_app_product_analytics_day(v_day);
  if exists (
    select 1 from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date = v_day
  ) then
    perform public.finalize_veinvite_daily_funnel_day(v_day);
  end if;

  delete from public.app_product_events
  where usage_date = v_day;
  get diagnostics v_deleted = row_count;

  insert into public.veinvite_archive_manifest_events(manifest_id,status,details)
  values(
    v_manifest_id,
    'HOT_SOURCE_PURGED',
    jsonb_build_object(
      'sourceRowsPurged', true,
      'archivedRowCount', v_archived_count,
      'physicalRowsDeleted', v_deleted
    )
  );

  return query select 1, v_deleted;
end;
$$;

revoke all on function public.compact_app_product_analytics(integer)
  from public, anon, authenticated;
grant execute on function public.compact_app_product_analytics(integer)
  to postgres, service_role;

create or replace function public.compact_app_usage_analytics(p_retention_days integer default null)
returns table(compacted_days integer, sessions_deleted bigint, visitors_deleted bigint)
language plpgsql
set search_path = public
as $$
declare
  v_policy_days integer;
  v_retention_days integer;
  v_cutoff date;
  v_day date;
  v_sessions bigint := 0;
  v_visitors bigint := 0;
  v_manifest_id bigint;
  v_archived_count bigint;
begin
  select p.hot_retention_days into v_policy_days
  from public.veinvite_retention_policy_versions p
  where p.dataset_key = 'app_usage_sessions'
    and p.effective_from <= clock_timestamp()
  order by p.effective_from desc, p.created_at desc
  limit 1;

  if v_policy_days is null then
    raise exception 'usage analytics cleanup blocked: active retention policy is missing';
  end if;

  v_retention_days := coalesce(p_retention_days, v_policy_days);
  if v_retention_days < v_policy_days or v_retention_days > 3650 then
    raise exception 'analytics retention days must be between active policy minimum % and 3650', v_policy_days;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('veinvite_analytics_exclusion_archive_cleanup', 0)
  );
  perform set_config('lock_timeout', '5s', true);
  lock table public.app_usage_sessions in share row exclusive mode;
  lock table public.app_product_events in share row exclusive mode;

  v_cutoff := (clock_timestamp() at time zone 'Asia/Seoul')::date - v_retention_days;

  select min((s.started_at at time zone 'Asia/Seoul')::date) into v_day
  from public.app_usage_sessions s
  where (s.started_at at time zone 'Asia/Seoul')::date <= v_cutoff;

  if v_day is null then
    return query select 0, 0::bigint, 0::bigint;
    return;
  end if;

  if exists (
    select 1 from public.app_product_events e
    where e.usage_date = v_day
  ) then
    raise exception 'raw usage cleanup blocked: product analytics for % must be compacted first', v_day;
  end if;

  v_manifest_id := public.current_verified_analytics_archive_manifest_id(
    'app_usage_sessions', v_day
  );
  if v_manifest_id is null then
    raise exception 'raw usage cleanup blocked: % does not have a current VERIFIED one-day archive manifest', v_day;
  end if;

  select source_row_count into v_archived_count
  from public.veinvite_archive_manifests
  where id = v_manifest_id;

  perform public.finalize_app_usage_analytics_day(v_day);
  perform public.finalize_veinvite_daily_funnel_day(v_day);

  delete from public.app_usage_sessions s
  where (s.started_at at time zone 'Asia/Seoul')::date = v_day;
  get diagnostics v_sessions = row_count;

  insert into public.veinvite_archive_manifest_events(manifest_id,status,details)
  values(
    v_manifest_id,
    'HOT_SOURCE_PURGED',
    jsonb_build_object(
      'sourceRowsPurged', true,
      'archivedRowCount', v_archived_count,
      'physicalRowsDeleted', v_sessions
    )
  );

  delete from public.operator_fast_usage_visitors
  where usage_date = v_day;

  delete from public.app_usage_visitors v
  where not exists (
    select 1 from public.app_usage_sessions s
    where s.visitor_key = v.visitor_key
  );
  get diagnostics v_visitors = row_count;

  delete from public.app_usage_excluded_visitors x
  where not exists (
    select 1 from public.app_usage_sessions s
    where s.visitor_key = x.visitor_key
  );

  return query select 1, v_sessions, v_visitors;
end;
$$;

revoke all on function public.compact_app_usage_analytics(integer)
  from public, anon, authenticated;
grant execute on function public.compact_app_usage_analytics(integer)
  to postgres, service_role;
