-- Re-apply long-term analytics recalculation hardening after the archive
-- foundation is present. This is intentionally ordered after the foundation so
-- a fresh database never references archive helpers before they exist.

create or replace function public.finalize_app_product_analytics_day(p_usage_date date)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_events bigint := 0;
  v_archived boolean := false;
begin
  if p_usage_date is null then
    raise exception 'usage date is required';
  end if;
  if p_usage_date >= (clock_timestamp() at time zone 'Asia/Seoul')::date then
    raise exception 'only completed Seoul calendar days can be finalized';
  end if;

  select count(*) into v_events
  from public.app_product_events e
  where e.usage_date = p_usage_date;

  if v_events = 0 then
    v_archived := public.is_analytics_date_verified_archived(
      'app_product_events', p_usage_date
    );

    if v_archived then
      return jsonb_build_object(
        'usageDate', p_usage_date,
        'events', 0,
        'finalized', false,
        'preservedArchivedRollup', true
      );
    end if;

    delete from public.app_product_event_daily_dimension_rollups
    where usage_date = p_usage_date;
    delete from public.app_product_event_daily_rollups
    where usage_date = p_usage_date;

    return jsonb_build_object(
      'usageDate', p_usage_date,
      'events', 0,
      'finalized', true,
      'clearedStaleRollups', true
    );
  end if;

  -- Full replacement prevents stale groups surviving after an exclusion or
  -- other legitimate source-row removal.
  delete from public.app_product_event_daily_dimension_rollups
  where usage_date = p_usage_date;
  delete from public.app_product_event_daily_rollups
  where usage_date = p_usage_date;

  insert into public.app_product_event_daily_rollups(
    usage_date, event_name, outcome, failure_code, mission_key, flow_key,
    entry_class, build_id, event_count, finalized_at
  )
  select
    p_usage_date, e.event_name, e.outcome, e.failure_code, e.mission_key,
    e.flow_key, e.entry_class, e.build_id, count(*)::bigint, clock_timestamp()
  from public.app_product_events e
  where e.usage_date = p_usage_date
    and not exists (
      select 1
      from public.app_usage_excluded_visitors x
      where x.visitor_key = e.visitor_key
    )
  group by
    e.event_name, e.outcome, e.failure_code, e.mission_key, e.flow_key,
    e.entry_class, e.build_id;

  insert into public.app_product_event_daily_dimension_rollups(
    usage_date, event_name, dimension_name, dimension_value,
    event_count, finalized_at
  )
  select
    p_usage_date, e.event_name, d.dimension_name, d.dimension_value,
    count(*)::bigint, clock_timestamp()
  from public.app_product_events e
  cross join lateral (
    values
      ('locale'::text, e.locale),
      ('device'::text, e.device_bucket),
      ('source'::text, e.acquisition_source)
  ) d(dimension_name, dimension_value)
  where e.usage_date = p_usage_date
    and not exists (
      select 1
      from public.app_usage_excluded_visitors x
      where x.visitor_key = e.visitor_key
    )
  group by e.event_name, d.dimension_name, d.dimension_value;

  return jsonb_build_object(
    'usageDate', p_usage_date,
    'events', v_events,
    'finalized', true
  );
end;
$$;

revoke all on function public.finalize_app_product_analytics_day(date)
  from public, anon, authenticated;
grant execute on function public.finalize_app_product_analytics_day(date)
  to service_role;

create or replace function public.finalize_veinvite_daily_funnel_day(p_usage_date date)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_visitors bigint := 0;
  v_raw_sessions bigint := 0;
  v_raw_product_events bigint := 0;
  v_usage_archived boolean := false;
  v_product_archived boolean := false;
begin
  if p_usage_date is null then
    raise exception 'usage date is required';
  end if;
  if p_usage_date >= (clock_timestamp() at time zone 'Asia/Seoul')::date then
    raise exception 'only completed Seoul calendar days can be finalized';
  end if;

  select count(*) into v_raw_sessions
  from public.app_usage_sessions s
  where (s.started_at at time zone 'Asia/Seoul')::date = p_usage_date;

  select count(*) into v_raw_product_events
  from public.app_product_events e
  where e.usage_date = p_usage_date;

  if v_raw_sessions = 0 then
    v_usage_archived := public.is_analytics_date_verified_archived(
      'app_usage_sessions', p_usage_date
    );
    if v_usage_archived then
      return jsonb_build_object(
        'usageDate', p_usage_date,
        'finalized', false,
        'preservedArchivedRollup', true,
        'archiveDataset', 'app_usage_sessions'
      );
    end if;
  end if;

  if v_raw_product_events = 0 then
    v_product_archived := public.is_analytics_date_verified_archived(
      'app_product_events', p_usage_date
    );
    if v_product_archived then
      return jsonb_build_object(
        'usageDate', p_usage_date,
        'finalized', false,
        'preservedArchivedRollup', true,
        'archiveDataset', 'app_product_events'
      );
    end if;
  end if;

  delete from public.veinvite_daily_funnel_rollups
  where usage_date = p_usage_date;

  with session_base as (
    select s.*
    from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date = p_usage_date
      and not exists (
        select 1
        from public.app_usage_excluded_visitors x
        where x.visitor_key = s.visitor_key
      )
  ), visitor_profile as (
    select
      s.visitor_key,
      bool_or(s.wallet_connected) as wallet_connected,
      (array_agg(s.current_locale order by s.last_seen_at desc, s.updated_at desc, s.session_id desc))[1] as locale,
      (array_agg(s.device_bucket order by s.last_seen_at desc, s.updated_at desc, s.session_id desc))[1] as device,
      (array_agg(s.acquisition_source order by s.last_seen_at desc, s.updated_at desc, s.session_id desc))[1] as source
    from session_base s
    group by s.visitor_key
  ), product_flags as (
    select
      e.visitor_key,
      bool_or(e.event_name = 'wallet_connect_started') as wallet_connect_started,
      bool_or(e.event_name = 'wallet_auth_succeeded') as wallet_auth_succeeded,
      bool_or(e.event_name = 'invite_accept_started') as invite_accept_started,
      bool_or(e.event_name = 'invite_accept_succeeded') as invite_accept_succeeded,
      bool_or(e.event_name = 'invite_accept_review') as invite_accept_review,
      bool_or(e.event_name = 'mission_action_opened') as mission_action_opened,
      bool_or(e.event_name = 'reward_claim_started') as reward_claim_started,
      bool_or(e.event_name = 'reward_claim_succeeded') as reward_claim_succeeded
    from public.app_product_events e
    where e.usage_date = p_usage_date
      and not exists (
        select 1
        from public.app_usage_excluded_visitors x
        where x.visitor_key = e.visitor_key
      )
    group by e.visitor_key
  ), joined as (
    select
      v.*,
      coalesce(p.wallet_connect_started, false) as wallet_connect_started,
      coalesce(p.wallet_auth_succeeded, false) as wallet_auth_succeeded,
      coalesce(p.invite_accept_started, false) as invite_accept_started,
      coalesce(p.invite_accept_succeeded, false) as invite_accept_succeeded,
      coalesce(p.invite_accept_review, false) as invite_accept_review,
      coalesce(p.mission_action_opened, false) as mission_action_opened,
      coalesce(p.reward_claim_started, false) as reward_claim_started,
      coalesce(p.reward_claim_succeeded, false) as reward_claim_succeeded
    from visitor_profile v
    left join product_flags p using(visitor_key)
  ), dimensions as (
    select j.*, 'all'::text as dimension_name, 'all'::text as dimension_value from joined j
    union all select j.*, 'locale', coalesce(j.locale, 'unknown') from joined j
    union all select j.*, 'device', coalesce(j.device, 'unknown') from joined j
    union all select j.*, 'source', coalesce(j.source, 'unknown') from joined j
  )
  insert into public.veinvite_daily_funnel_rollups(
    usage_date, dimension_name, dimension_value, unique_visitors,
    wallet_connected_visitors, wallet_connect_started_visitors,
    wallet_auth_succeeded_visitors, invite_accept_started_visitors,
    invite_accept_succeeded_visitors, invite_accept_review_visitors,
    mission_action_opened_visitors, reward_claim_started_visitors,
    reward_claim_succeeded_visitors, metric_rule_version, finalized_at
  )
  select
    p_usage_date, d.dimension_name, d.dimension_value,
    count(*)::bigint,
    count(*) filter(where d.wallet_connected)::bigint,
    count(*) filter(where d.wallet_connect_started)::bigint,
    count(*) filter(where d.wallet_auth_succeeded)::bigint,
    count(*) filter(where d.invite_accept_started)::bigint,
    count(*) filter(where d.invite_accept_succeeded)::bigint,
    count(*) filter(where d.invite_accept_review)::bigint,
    count(*) filter(where d.mission_action_opened)::bigint,
    count(*) filter(where d.reward_claim_started)::bigint,
    count(*) filter(where d.reward_claim_succeeded)::bigint,
    'daily-anonymous-funnel-v1', clock_timestamp()
  from dimensions d
  group by d.dimension_name, d.dimension_value;

  insert into public.veinvite_daily_funnel_rollups(
    usage_date, dimension_name, dimension_value, unique_visitors,
    wallet_connected_visitors, wallet_connect_started_visitors,
    wallet_auth_succeeded_visitors, invite_accept_started_visitors,
    invite_accept_succeeded_visitors, invite_accept_review_visitors,
    mission_action_opened_visitors, reward_claim_started_visitors,
    reward_claim_succeeded_visitors, metric_rule_version, finalized_at
  ) values (
    p_usage_date, 'all', 'all', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    'daily-anonymous-funnel-v1', clock_timestamp()
  ) on conflict(usage_date, dimension_name, dimension_value) do nothing;

  select unique_visitors into v_visitors
  from public.veinvite_daily_funnel_rollups
  where usage_date = p_usage_date
    and dimension_name = 'all'
    and dimension_value = 'all';

  return jsonb_build_object(
    'usageDate', p_usage_date,
    'uniqueVisitors', coalesce(v_visitors, 0),
    'finalized', true
  );
end;
$$;

revoke all on function public.finalize_veinvite_daily_funnel_day(date)
  from public, anon, authenticated;
grant execute on function public.finalize_veinvite_daily_funnel_day(date)
  to service_role;

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
