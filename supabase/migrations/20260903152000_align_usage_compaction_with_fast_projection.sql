-- Keep the fast daily visitor projection inside the same 30-day privacy
-- retention boundary as raw usage sessions. Before identifiers are removed,
-- persist locale using the visitor's final/current app language for that day.

begin;

create or replace function public.compact_app_usage_analytics(
  p_retention_days integer default 30
)
returns table (
  compacted_days integer,
  sessions_deleted bigint,
  visitors_deleted bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  cutoff date;
  d date;
  days_count integer := 0;
  deleted_sessions bigint := 0;
  deleted_visitors bigint := 0;
  n bigint := 0;
begin
  if p_retention_days < 7 or p_retention_days > 365 then
    raise exception 'analytics retention days must be between 7 and 365';
  end if;

  cutoff := (now() at time zone 'Asia/Seoul')::date - p_retention_days;

  for d in
    select distinct (s.started_at at time zone 'Asia/Seoul')::date
    from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date <= cutoff
    order by 1
  loop
    with ds as (
      select *
      from public.app_usage_sessions s
      where (s.started_at at time zone 'Asia/Seoul')::date = d
        and not exists (
          select 1 from public.app_usage_excluded_visitors x
          where x.visitor_key = s.visitor_key
        )
    ), vf as (
      select visitor_key, bool_or(returning_visitor) as is_returning
      from ds
      group by visitor_key
    ), vm as (
      select
        count(*)::bigint as uv,
        count(*) filter (where not is_returning)::bigint as nv,
        count(*) filter (where is_returning)::bigint as rv
      from vf
    ), sm as (
      select
        count(*)::bigint as sessions,
        count(distinct visitor_key) filter (where wallet_connected)::bigint as connected,
        count(*) filter (where active_seconds >= 30)::bigint as engaged,
        coalesce(sum(view_count),0)::bigint as views,
        coalesce(sum(active_seconds),0)::bigint as seconds,
        coalesce(round(avg(active_seconds)::numeric,1),0::numeric) as avg_seconds,
        coalesce(
          round(
            percentile_cont(0.5) within group (order by active_seconds)::numeric,
            1
          ),
          0::numeric
        ) as median_seconds
      from ds
    )
    insert into public.app_usage_daily_rollups (
      usage_date, unique_visitors, new_visitors, returning_visitors,
      sessions, wallet_connected_visitors, engaged_sessions, view_count,
      total_active_seconds, average_active_seconds, median_active_seconds,
      finalized_at
    )
    select
      d, vm.uv, vm.nv, vm.rv, sm.sessions, sm.connected, sm.engaged,
      sm.views, sm.seconds, sm.avg_seconds, sm.median_seconds, now()
    from vm cross join sm
    on conflict (usage_date) do update
    set unique_visitors = excluded.unique_visitors,
        new_visitors = excluded.new_visitors,
        returning_visitors = excluded.returning_visitors,
        sessions = excluded.sessions,
        wallet_connected_visitors = excluded.wallet_connected_visitors,
        engaged_sessions = excluded.engaged_sessions,
        view_count = excluded.view_count,
        total_active_seconds = excluded.total_active_seconds,
        average_active_seconds = excluded.average_active_seconds,
        median_active_seconds = excluded.median_active_seconds,
        finalized_at = excluded.finalized_at;

    delete from public.app_usage_daily_dimension_rollups
    where usage_date = d;

    insert into public.app_usage_daily_dimension_rollups (
      usage_date, dimension_name, dimension_value,
      sessions, unique_visitors, total_active_seconds, finalized_at
    )
    select
      d,
      q.dimension_name,
      q.dimension_value,
      q.sessions,
      q.unique_visitors,
      q.total_active_seconds,
      now()
    from (
      select
        'device'::text as dimension_name,
        s.device_bucket as dimension_value,
        count(*)::bigint as sessions,
        count(distinct s.visitor_key)::bigint as unique_visitors,
        coalesce(sum(s.active_seconds),0)::bigint as total_active_seconds
      from public.app_usage_sessions s
      where (s.started_at at time zone 'Asia/Seoul')::date = d
        and not exists (
          select 1 from public.app_usage_excluded_visitors x
          where x.visitor_key = s.visitor_key
        )
      group by s.device_bucket

      union all

      select
        'source',
        s.acquisition_source,
        count(*)::bigint,
        count(distinct s.visitor_key)::bigint,
        coalesce(sum(s.active_seconds),0)::bigint
      from public.app_usage_sessions s
      where (s.started_at at time zone 'Asia/Seoul')::date = d
        and not exists (
          select 1 from public.app_usage_excluded_visitors x
          where x.visitor_key = s.visitor_key
        )
      group by s.acquisition_source

      union all

      select
        'locale',
        v.locale,
        sum(v.sessions)::bigint,
        count(*)::bigint,
        sum(v.seconds)::bigint
      from (
        select
          s.visitor_key,
          count(*)::bigint as sessions,
          coalesce(sum(s.active_seconds),0)::bigint as seconds,
          (array_agg(
            s.current_locale
            order by s.last_seen_at desc, s.updated_at desc, s.session_id desc
          ))[1] as locale
        from public.app_usage_sessions s
        where (s.started_at at time zone 'Asia/Seoul')::date = d
          and not exists (
            select 1 from public.app_usage_excluded_visitors x
            where x.visitor_key = s.visitor_key
          )
        group by s.visitor_key
      ) v
      group by v.locale
    ) q;

    delete from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date = d;
    get diagnostics n = row_count;
    deleted_sessions := deleted_sessions + n;

    delete from public.operator_fast_usage_visitors
    where usage_date = d;

    days_count := days_count + 1;
  end loop;

  delete from public.app_usage_visitors v
  where not exists (
    select 1 from public.app_usage_sessions s
    where s.visitor_key = v.visitor_key
  );
  get diagnostics deleted_visitors = row_count;

  delete from public.app_usage_excluded_visitors x
  where not exists (
    select 1 from public.app_usage_sessions s
    where s.visitor_key = x.visitor_key
  );

  return query
  select days_count, deleted_sessions, deleted_visitors;
end;
$$;

revoke all on function public.compact_app_usage_analytics(integer)
  from public, anon, authenticated;
grant execute on function public.compact_app_usage_analytics(integer)
  to service_role;

commit;
