-- Keep every operator language surface on the same privacy-safe definition:
-- one daily anonymous visitor contributes to exactly one final/current locale.
-- Also make reconciliation explicitly current/raw-data-only so compacted dates
-- cannot create a false drift alert after source identifiers are deleted.

begin;

create or replace function public.read_app_usage_dimension_breakdown(
  p_from_date date,
  p_to_date date,
  p_dimension text
)
returns table (
  dimension_value text,
  sessions bigint,
  unique_visitors bigint,
  total_active_seconds bigint
)
language sql
security invoker
set search_path = public
as $$
  with raw_session_base as (
    select
      (s.started_at at time zone 'Asia/Seoul')::date as usage_date,
      s.*
    from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date between p_from_date and p_to_date
      and not exists (
        select 1 from public.app_usage_excluded_visitors x
        where x.visitor_key = s.visitor_key
      )
  ), raw_final_locale_visitors as (
    select
      usage_date,
      visitor_key,
      count(*)::bigint as sessions,
      coalesce(sum(active_seconds), 0)::bigint as total_active_seconds,
      (array_agg(
        current_locale
        order by last_seen_at desc, updated_at desc, session_id desc
      ))[1] as final_locale
    from raw_session_base
    group by usage_date, visitor_key
  ), raw_locale as (
    select
      final_locale as dimension_value,
      sum(sessions)::bigint as sessions,
      count(*)::bigint as unique_visitors,
      sum(total_active_seconds)::bigint as total_active_seconds
    from raw_final_locale_visitors
    where p_dimension = 'locale'
    group by final_locale
  ), raw_other as (
    select
      case p_dimension
        when 'device' then device_bucket
        when 'source' then acquisition_source
        else null
      end as dimension_value,
      count(*)::bigint as sessions,
      count(distinct visitor_key)::bigint as unique_visitors,
      coalesce(sum(active_seconds), 0)::bigint as total_active_seconds
    from raw_session_base
    where p_dimension in ('device', 'source')
    group by 1
  ), raw as (
    select * from raw_locale
    union all
    select * from raw_other
  ), rolled as (
    select
      r.dimension_value,
      sum(r.sessions)::bigint as sessions,
      sum(r.unique_visitors)::bigint as unique_visitors,
      sum(r.total_active_seconds)::bigint as total_active_seconds
    from public.app_usage_daily_dimension_rollups r
    where r.usage_date between p_from_date and p_to_date
      and r.dimension_name = p_dimension
    group by r.dimension_value
  )
  select
    x.dimension_value,
    sum(x.sessions)::bigint,
    sum(x.unique_visitors)::bigint,
    sum(x.total_active_seconds)::bigint
  from (
    select * from raw
    union all
    select * from rolled
  ) x
  where x.dimension_value is not null
  group by x.dimension_value
  order by sum(x.sessions) desc, x.dimension_value asc;
$$;

revoke all on function public.read_app_usage_dimension_breakdown(date,date,text)
  from public, anon, authenticated;
grant execute on function public.read_app_usage_dimension_breakdown(date,date,text)
  to service_role;

create or replace function public.reconcile_operator_fast_status(
  p_usage_date date default ((now() at time zone 'Asia/Seoul')::date),
  p_record boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  f jsonb;
  s jsonb;
  fc jsonb;
  ok boolean;
  log_id bigint;
begin
  if exists (
    select 1
    from public.app_usage_daily_rollups
    where usage_date = p_usage_date
  ) then
    raise exception
      'fast status reconciliation is only supported while raw usage data is retained for %',
      p_usage_date;
  end if;

  f := public.read_operator_fast_status(p_usage_date);
  s := public.compute_operator_raw_status(p_usage_date);
  fc := f - 'generatedAt';
  ok := fc = s;

  if p_record then
    insert into public.operator_fast_reconciliation_log (
      usage_date,
      metric_rule_version,
      matches,
      fast_snapshot,
      source_snapshot,
      details
    ) values (
      p_usage_date,
      'operator-fast-v1',
      ok,
      fc,
      s,
      jsonb_build_object(
        'walletRows', (select count(*) from public.operator_fast_wallets),
        'walletDayRows', (select count(*) from public.operator_fast_wallet_days),
        'invitationRows', (select count(*) from public.operator_fast_invitations),
        'usageVisitorRows', (
          select count(*)
          from public.operator_fast_usage_visitors
          where usage_date = p_usage_date
        )
      )
    )
    returning id into log_id;
  end if;

  return jsonb_build_object(
    'matches', ok,
    'usageDate', p_usage_date,
    'logId', log_id,
    'fast', fc,
    'source', s
  );
end;
$$;

revoke all on function public.reconcile_operator_fast_status(date, boolean)
  from public, anon, authenticated;
grant execute on function public.reconcile_operator_fast_status(date, boolean)
  to service_role;

commit;
