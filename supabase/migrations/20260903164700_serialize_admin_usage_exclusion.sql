-- Serialize usage recording and administrator exclusion per anonymous visitor.
-- This closes the narrow race where a page-view could pass the exclusion check
-- just before the admin visitor is suppressed, leaving one aggregate view count.

begin;

create or replace function public.exclude_app_usage_visitor(p_visitor_key text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inserted boolean := false;
  v_row record;
begin
  if p_visitor_key !~ '^[0-9a-f]{64}$' then
    raise exception 'visitor key is malformed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_visitor_key, 0)
  );

  insert into public.app_usage_excluded_visitors (visitor_key, excluded_at, reason)
  values (p_visitor_key, clock_timestamp(), 'ADMIN_WALLET')
  on conflict (visitor_key) do nothing;
  v_inserted := found;

  -- Always clean any remaining per-session view rows. This is deliberately
  -- idempotent so a repeated admin signal can repair an interrupted prior call.
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

  return v_inserted;
end;
$$;

revoke all on function public.exclude_app_usage_visitor(text)
  from public, anon, authenticated, service_role;
grant execute on function public.exclude_app_usage_visitor(text)
  to service_role;

create or replace function public.record_app_usage_event(
  p_session_id uuid,
  p_visitor_key text,
  p_kind text,
  p_view_name text,
  p_locale text,
  p_device_bucket text,
  p_acquisition_source text,
  p_active_delta_seconds integer,
  p_wallet_connected boolean default false,
  p_returning_visitor boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_usage_date date := (v_now at time zone 'Asia/Seoul')::date;
  v_view_increment integer := case when p_kind in ('start', 'pageview') then 1 else 0 end;
begin
  if p_visitor_key !~ '^[0-9a-f]{64}$' then raise exception 'visitor key is malformed'; end if;
  if p_kind not in ('start', 'pageview', 'heartbeat', 'end') then raise exception 'usage event kind is unsupported'; end if;
  if p_view_name not in ('home', 'guide', 'leaderboard', 'settings', 'invite_landing', 'privacy', 'terms', 'other') then raise exception 'usage view is unsupported'; end if;
  if p_locale !~ '^[a-z]{2,3}(-[a-z]{2})?$' then raise exception 'usage locale is malformed'; end if;
  if p_device_bucket not in ('mobile', 'tablet', 'desktop') then raise exception 'usage device bucket is unsupported'; end if;
  if p_acquisition_source not in ('direct', 'x', 'telegram', 'search', 'vechain', 'other') then raise exception 'usage acquisition source is unsupported'; end if;
  if p_active_delta_seconds < 0 or p_active_delta_seconds > 90 then raise exception 'active usage delta is out of bounds'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_visitor_key, 0)
  );

  if exists (
    select 1
    from public.app_usage_excluded_visitors x
    where x.visitor_key = p_visitor_key
  ) then
    return;
  end if;

  insert into public.app_usage_visitors (visitor_key, first_seen_at, last_seen_at)
  values (p_visitor_key, v_now, v_now)
  on conflict (visitor_key) do update
  set last_seen_at = greatest(public.app_usage_visitors.last_seen_at, excluded.last_seen_at);

  insert into public.app_usage_sessions (
    session_id, visitor_key, started_at, last_seen_at, ended_at, active_seconds, view_count,
    entry_view, last_view, initial_locale, current_locale, device_bucket, acquisition_source,
    wallet_connected, returning_visitor, updated_at
  ) values (
    p_session_id, p_visitor_key, v_now, v_now,
    case when p_kind = 'end' then v_now else null end,
    p_active_delta_seconds, v_view_increment, p_view_name, p_view_name, p_locale, p_locale,
    p_device_bucket, p_acquisition_source, coalesce(p_wallet_connected, false),
    coalesce(p_returning_visitor, false), v_now
  )
  on conflict (session_id) do update
  set last_seen_at = v_now,
      ended_at = case when p_kind = 'end' then v_now when p_kind = 'start' then null else public.app_usage_sessions.ended_at end,
      active_seconds = least(2147483647, public.app_usage_sessions.active_seconds + p_active_delta_seconds),
      view_count = public.app_usage_sessions.view_count + v_view_increment,
      last_view = p_view_name,
      current_locale = p_locale,
      device_bucket = p_device_bucket,
      wallet_connected = public.app_usage_sessions.wallet_connected or coalesce(p_wallet_connected, false),
      returning_visitor = public.app_usage_sessions.returning_visitor or coalesce(p_returning_visitor, false),
      updated_at = v_now
  where public.app_usage_sessions.visitor_key = excluded.visitor_key;

  if v_view_increment = 1 then
    insert into public.app_usage_daily_view_counts (usage_date, view_name, view_count)
    values (v_usage_date, p_view_name, 1)
    on conflict (usage_date, view_name) do update
    set view_count = public.app_usage_daily_view_counts.view_count + 1;

    insert into public.app_usage_session_view_counts (
      session_id, visitor_key, usage_date, view_name, view_count
    ) values (
      p_session_id, p_visitor_key, v_usage_date, p_view_name, 1
    )
    on conflict (session_id, view_name) do update
    set view_count = public.app_usage_session_view_counts.view_count + 1
    where public.app_usage_session_view_counts.visitor_key = excluded.visitor_key;
  end if;
end;
$$;

revoke all on function public.record_app_usage_event(uuid,text,text,text,text,text,text,integer,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.record_app_usage_event(uuid,text,text,text,text,text,text,integer,boolean,boolean)
  to service_role;

commit;
