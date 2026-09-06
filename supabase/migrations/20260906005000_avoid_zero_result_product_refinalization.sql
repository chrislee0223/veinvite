-- A completed product-analytics day can legitimately have raw rows but zero
-- included rows after administrator/operator exclusions. In that case the
-- product rollup table intentionally has no rows. Do not mistake that valid
-- zero result for a missing finalization forever.

create or replace function public.finalize_long_term_analytics(
  p_through_date date default ((clock_timestamp() at time zone 'Asia/Seoul')::date - 1)
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_day date;
  v_usage_days integer := 0;
  v_product_days integer := 0;
  v_funnel_days integer := 0;
  v_recent_from date;
begin
  if p_through_date is null then
    raise exception 'through date is required';
  end if;
  if p_through_date >= (clock_timestamp() at time zone 'Asia/Seoul')::date then
    raise exception 'through date must be a completed Seoul calendar day';
  end if;

  v_recent_from := p_through_date - 2;

  for v_day in
    select d.usage_date
    from (
      select distinct (s.started_at at time zone 'Asia/Seoul')::date as usage_date
      from public.app_usage_sessions s
      where (s.started_at at time zone 'Asia/Seoul')::date <= p_through_date
    ) d
    where d.usage_date >= v_recent_from
       or not exists (
         select 1 from public.app_usage_daily_rollups r
         where r.usage_date = d.usage_date
       )
       or not exists (
         select 1 from public.veinvite_daily_funnel_rollups f
         where f.usage_date = d.usage_date
           and f.dimension_name = 'all'
           and f.dimension_value = 'all'
       )
    order by d.usage_date
  loop
    perform public.finalize_app_usage_analytics_day(v_day);
    perform public.finalize_veinvite_daily_funnel_day(v_day);
    v_usage_days := v_usage_days + 1;
    v_funnel_days := v_funnel_days + 1;
  end loop;

  for v_day in
    select d.usage_date
    from (
      select distinct e.usage_date
      from public.app_product_events e
      where e.usage_date <= p_through_date
    ) d
    where d.usage_date >= v_recent_from
       or (
         not exists (
           select 1
           from public.app_product_event_daily_rollups r
           where r.usage_date = d.usage_date
         )
         and exists (
           select 1
           from public.app_product_events e
           where e.usage_date = d.usage_date
             and not exists (
               select 1
               from public.app_usage_excluded_visitors x
               where x.visitor_key = e.visitor_key
             )
         )
       )
    order by d.usage_date
  loop
    perform public.finalize_app_product_analytics_day(v_day);
    if exists (
      select 1 from public.app_usage_sessions s
      where (s.started_at at time zone 'Asia/Seoul')::date = v_day
    ) then
      perform public.finalize_veinvite_daily_funnel_day(v_day);
    end if;
    v_product_days := v_product_days + 1;
  end loop;

  return jsonb_build_object(
    'throughDate', p_through_date,
    'recentRefreshFrom', v_recent_from,
    'usageDaysFinalized', v_usage_days,
    'productDaysFinalized', v_product_days,
    'funnelDaysFinalized', v_funnel_days,
    'rawRowsDeleted', 0
  );
end;
$$;

revoke all on function public.finalize_long_term_analytics(date)
  from public, anon, authenticated;
grant execute on function public.finalize_long_term_analytics(date)
  to postgres, service_role;
