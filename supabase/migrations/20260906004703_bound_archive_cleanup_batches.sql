alter table public.veinvite_archive_manifests add constraint veinvite_archive_analytics_daily_period_check check (dataset_key not in ('app_usage_sessions','app_product_events') or period_start=period_end) not valid;
alter table public.veinvite_archive_manifests validate constraint veinvite_archive_analytics_daily_period_check;

create or replace function public.compact_app_product_analytics(p_retention_days integer default null)
returns table(compacted_days integer,events_deleted bigint)
language plpgsql set search_path=public as $$
declare v_policy_days integer; v_retention_days integer; v_cutoff date; v_day date; v_deleted bigint:=0;
begin
  select p.hot_retention_days into v_policy_days from public.veinvite_retention_policy_versions p where p.dataset_key='app_product_events' and p.effective_from<=clock_timestamp() order by p.effective_from desc,p.created_at desc limit 1;
  if v_policy_days is null then raise exception 'product analytics cleanup blocked: active retention policy is missing'; end if;
  v_retention_days:=coalesce(p_retention_days,v_policy_days);
  if v_retention_days<v_policy_days or v_retention_days>3650 then raise exception 'product analytics retention days must be between active policy minimum % and 3650',v_policy_days; end if;
  perform set_config('lock_timeout','5s',true);
  lock table public.app_usage_sessions in share row exclusive mode;
  lock table public.app_product_events in share row exclusive mode;
  v_cutoff:=(clock_timestamp() at time zone 'Asia/Seoul')::date-v_retention_days;
  select min(e.usage_date) into v_day from public.app_product_events e where e.usage_date<=v_cutoff;
  if v_day is null then return query select 0,0::bigint; return; end if;
  if not public.is_analytics_date_verified_archived('app_product_events',v_day) then raise exception 'raw product analytics cleanup blocked: % does not have a current VERIFIED one-day archive manifest',v_day; end if;
  perform public.finalize_app_product_analytics_day(v_day);
  if exists(select 1 from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=v_day) then perform public.finalize_veinvite_daily_funnel_day(v_day); end if;
  delete from public.app_product_events where usage_date=v_day;
  get diagnostics v_deleted=row_count;
  return query select 1,v_deleted;
end;
$$;
revoke all on function public.compact_app_product_analytics(integer) from public,anon,authenticated;
grant execute on function public.compact_app_product_analytics(integer) to postgres,service_role;

create or replace function public.compact_app_usage_analytics(p_retention_days integer default null)
returns table(compacted_days integer,sessions_deleted bigint,visitors_deleted bigint)
language plpgsql set search_path=public as $$
declare v_policy_days integer; v_retention_days integer; v_cutoff date; v_day date; v_sessions bigint:=0; v_visitors bigint:=0;
begin
  select p.hot_retention_days into v_policy_days from public.veinvite_retention_policy_versions p where p.dataset_key='app_usage_sessions' and p.effective_from<=clock_timestamp() order by p.effective_from desc,p.created_at desc limit 1;
  if v_policy_days is null then raise exception 'usage analytics cleanup blocked: active retention policy is missing'; end if;
  v_retention_days:=coalesce(p_retention_days,v_policy_days);
  if v_retention_days<v_policy_days or v_retention_days>3650 then raise exception 'analytics retention days must be between active policy minimum % and 3650',v_policy_days; end if;
  perform set_config('lock_timeout','5s',true);
  lock table public.app_usage_sessions in share row exclusive mode;
  lock table public.app_product_events in share row exclusive mode;
  v_cutoff:=(clock_timestamp() at time zone 'Asia/Seoul')::date-v_retention_days;
  select min((s.started_at at time zone 'Asia/Seoul')::date) into v_day from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date<=v_cutoff;
  if v_day is null then return query select 0,0::bigint,0::bigint; return; end if;
  if exists(select 1 from public.app_product_events e where e.usage_date=v_day) then raise exception 'raw usage cleanup blocked: product analytics for % must be compacted first',v_day; end if;
  if not public.is_analytics_date_verified_archived('app_usage_sessions',v_day) then raise exception 'raw usage cleanup blocked: % does not have a current VERIFIED one-day archive manifest',v_day; end if;
  perform public.finalize_app_usage_analytics_day(v_day);
  perform public.finalize_veinvite_daily_funnel_day(v_day);
  delete from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=v_day;
  get diagnostics v_sessions=row_count;
  delete from public.operator_fast_usage_visitors where usage_date=v_day;
  delete from public.app_usage_visitors v where not exists(select 1 from public.app_usage_sessions s where s.visitor_key=v.visitor_key);
  get diagnostics v_visitors=row_count;
  delete from public.app_usage_excluded_visitors x where not exists(select 1 from public.app_usage_sessions s where s.visitor_key=x.visitor_key);
  return query select 1,v_sessions,v_visitors;
end;
$$;
revoke all on function public.compact_app_usage_analytics(integer) from public,anon,authenticated;
grant execute on function public.compact_app_usage_analytics(integer) to postgres,service_role;