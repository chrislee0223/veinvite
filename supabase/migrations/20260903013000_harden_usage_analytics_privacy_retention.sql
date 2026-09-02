alter table public.app_usage_sessions
  add column if not exists returning_visitor boolean not null default false;

comment on column public.app_usage_sessions.returning_visitor is
  'Client-provided one-bit signal that this browser had a prior VeInvite visit. The daily anonymous identifier itself rotates every Asia/Seoul calendar day.';

create table if not exists public.app_usage_daily_rollups (
  usage_date date primary key,
  unique_visitors bigint not null check (unique_visitors >= 0),
  new_visitors bigint not null check (new_visitors >= 0),
  returning_visitors bigint not null check (returning_visitors >= 0),
  sessions bigint not null check (sessions >= 0),
  wallet_connected_visitors bigint not null check (wallet_connected_visitors >= 0),
  engaged_sessions bigint not null check (engaged_sessions >= 0),
  view_count bigint not null check (view_count >= 0),
  total_active_seconds bigint not null check (total_active_seconds >= 0),
  average_active_seconds numeric not null check (average_active_seconds >= 0),
  median_active_seconds numeric not null check (median_active_seconds >= 0),
  finalized_at timestamptz not null default now()
);

comment on table public.app_usage_daily_rollups is
  'Identifier-free finalized daily VeInvite usage statistics retained after raw session compaction.';

create table if not exists public.app_usage_daily_dimension_rollups (
  usage_date date not null,
  dimension_name text not null check (dimension_name in ('locale', 'device', 'source')),
  dimension_value text not null,
  sessions bigint not null check (sessions >= 0),
  unique_visitors bigint not null check (unique_visitors >= 0),
  total_active_seconds bigint not null check (total_active_seconds >= 0),
  finalized_at timestamptz not null default now(),
  primary key (usage_date, dimension_name, dimension_value)
);

comment on table public.app_usage_daily_dimension_rollups is
  'Identifier-free daily locale/device/source usage rollups retained after raw session compaction.';

alter table public.app_usage_daily_rollups enable row level security;
alter table public.app_usage_daily_dimension_rollups enable row level security;

revoke all on table public.app_usage_daily_rollups from public, anon, authenticated;
revoke all on table public.app_usage_daily_dimension_rollups from public, anon, authenticated;
grant select, insert, update, delete on table public.app_usage_daily_rollups to service_role;
grant select, insert, update, delete on table public.app_usage_daily_dimension_rollups to service_role;

drop function if exists public.record_app_usage_event(
  uuid, text, text, text, text, text, text, integer, boolean
);

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
  if p_visitor_key !~ '^[0-9a-f]{64}$' then
    raise exception 'visitor key is malformed';
  end if;

  if p_kind not in ('start', 'pageview', 'heartbeat', 'end') then
    raise exception 'usage event kind is unsupported';
  end if;

  if p_view_name not in ('home', 'guide', 'leaderboard', 'settings', 'invite_landing', 'privacy', 'terms', 'other') then
    raise exception 'usage view is unsupported';
  end if;

  if p_locale !~ '^[a-z]{2,3}(-[a-z]{2})?$' then
    raise exception 'usage locale is malformed';
  end if;

  if p_device_bucket not in ('mobile', 'tablet', 'desktop') then
    raise exception 'usage device bucket is unsupported';
  end if;

  if p_acquisition_source not in ('direct', 'x', 'telegram', 'search', 'vechain', 'other') then
    raise exception 'usage acquisition source is unsupported';
  end if;

  if p_active_delta_seconds < 0 or p_active_delta_seconds > 90 then
    raise exception 'active usage delta is out of bounds';
  end if;

  insert into public.app_usage_visitors (
    visitor_key,
    first_seen_at,
    last_seen_at
  ) values (
    p_visitor_key,
    v_now,
    v_now
  )
  on conflict (visitor_key) do update
  set last_seen_at = greatest(public.app_usage_visitors.last_seen_at, excluded.last_seen_at);

  insert into public.app_usage_sessions (
    session_id,
    visitor_key,
    started_at,
    last_seen_at,
    ended_at,
    active_seconds,
    view_count,
    entry_view,
    last_view,
    initial_locale,
    current_locale,
    device_bucket,
    acquisition_source,
    wallet_connected,
    returning_visitor,
    updated_at
  ) values (
    p_session_id,
    p_visitor_key,
    v_now,
    v_now,
    case when p_kind = 'end' then v_now else null end,
    p_active_delta_seconds,
    v_view_increment,
    p_view_name,
    p_view_name,
    p_locale,
    p_locale,
    p_device_bucket,
    p_acquisition_source,
    coalesce(p_wallet_connected, false),
    coalesce(p_returning_visitor, false),
    v_now
  )
  on conflict (session_id) do update
  set
    last_seen_at = v_now,
    ended_at = case
      when p_kind = 'end' then v_now
      when p_kind = 'start' then null
      else public.app_usage_sessions.ended_at
    end,
    active_seconds = least(
      2147483647,
      public.app_usage_sessions.active_seconds + p_active_delta_seconds
    ),
    view_count = public.app_usage_sessions.view_count + v_view_increment,
    last_view = p_view_name,
    current_locale = p_locale,
    device_bucket = p_device_bucket,
    wallet_connected = public.app_usage_sessions.wallet_connected or coalesce(p_wallet_connected, false),
    returning_visitor = public.app_usage_sessions.returning_visitor or coalesce(p_returning_visitor, false),
    updated_at = v_now
  where public.app_usage_sessions.visitor_key = excluded.visitor_key;

  if v_view_increment = 1 then
    insert into public.app_usage_daily_view_counts (
      usage_date,
      view_name,
      view_count
    ) values (
      v_usage_date,
      p_view_name,
      1
    )
    on conflict (usage_date, view_name) do update
    set view_count = public.app_usage_daily_view_counts.view_count + 1;
  end if;
end;
$$;

revoke all on function public.record_app_usage_event(
  uuid, text, text, text, text, text, text, integer, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.record_app_usage_event(
  uuid, text, text, text, text, text, text, integer, boolean, boolean
) to service_role;

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
  v_cutoff_date date;
  v_usage_date date;
  v_compacted_days integer := 0;
  v_sessions_deleted bigint := 0;
  v_visitors_deleted bigint := 0;
  v_deleted bigint := 0;
begin
  if p_retention_days < 7 or p_retention_days > 365 then
    raise exception 'analytics retention days must be between 7 and 365';
  end if;

  v_cutoff_date := (now() at time zone 'Asia/Seoul')::date - p_retention_days;

  for v_usage_date in
    select distinct (s.started_at at time zone 'Asia/Seoul')::date
    from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date <= v_cutoff_date
    order by 1
  loop
    with day_sessions as (
      select *
      from public.app_usage_sessions s
      where (s.started_at at time zone 'Asia/Seoul')::date = v_usage_date
    ),
    visitor_flags as (
      select
        visitor_key,
        bool_or(returning_visitor) as is_returning
      from day_sessions
      group by visitor_key
    ),
    visitor_metrics as (
      select
        count(*)::bigint as unique_visitors,
        count(*) filter (where not is_returning)::bigint as new_visitors,
        count(*) filter (where is_returning)::bigint as returning_visitors
      from visitor_flags
    ),
    session_metrics as (
      select
        count(*)::bigint as sessions,
        count(distinct visitor_key) filter (where wallet_connected)::bigint as wallet_connected_visitors,
        count(*) filter (where active_seconds >= 30)::bigint as engaged_sessions,
        coalesce(sum(view_count), 0)::bigint as view_count,
        coalesce(sum(active_seconds), 0)::bigint as total_active_seconds,
        coalesce(round(avg(active_seconds)::numeric, 1), 0::numeric) as average_active_seconds,
        coalesce(round(percentile_cont(0.5) within group (order by active_seconds)::numeric, 1), 0::numeric) as median_active_seconds
      from day_sessions
    )
    insert into public.app_usage_daily_rollups (
      usage_date,
      unique_visitors,
      new_visitors,
      returning_visitors,
      sessions,
      wallet_connected_visitors,
      engaged_sessions,
      view_count,
      total_active_seconds,
      average_active_seconds,
      median_active_seconds,
      finalized_at
    )
    select
      v_usage_date,
      v.unique_visitors,
      v.new_visitors,
      v.returning_visitors,
      s.sessions,
      s.wallet_connected_visitors,
      s.engaged_sessions,
      s.view_count,
      s.total_active_seconds,
      s.average_active_seconds,
      s.median_active_seconds,
      now()
    from visitor_metrics v
    cross join session_metrics s
    on conflict (usage_date) do update
    set
      unique_visitors = excluded.unique_visitors,
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
    where usage_date = v_usage_date;

    insert into public.app_usage_daily_dimension_rollups (
      usage_date,
      dimension_name,
      dimension_value,
      sessions,
      unique_visitors,
      total_active_seconds,
      finalized_at
    )
    select
      v_usage_date,
      d.dimension_name,
      d.dimension_value,
      count(*)::bigint,
      count(distinct s.visitor_key)::bigint,
      coalesce(sum(s.active_seconds), 0)::bigint,
      now()
    from public.app_usage_sessions s
    cross join lateral (
      values
        ('locale'::text, s.current_locale),
        ('device'::text, s.device_bucket),
        ('source'::text, s.acquisition_source)
    ) as d(dimension_name, dimension_value)
    where (s.started_at at time zone 'Asia/Seoul')::date = v_usage_date
    group by d.dimension_name, d.dimension_value;

    delete from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date = v_usage_date;
    get diagnostics v_deleted = row_count;
    v_sessions_deleted := v_sessions_deleted + v_deleted;
    v_compacted_days := v_compacted_days + 1;
  end loop;

  delete from public.app_usage_visitors v
  where not exists (
    select 1
    from public.app_usage_sessions s
    where s.visitor_key = v.visitor_key
  );
  get diagnostics v_visitors_deleted = row_count;

  return query
  select
    v_compacted_days,
    v_sessions_deleted,
    v_visitors_deleted;
end;
$$;

revoke all on function public.compact_app_usage_analytics(integer)
  from public, anon, authenticated;
grant execute on function public.compact_app_usage_analytics(integer)
  to service_role;

create or replace function public.read_app_usage_daily_summary(
  p_from_date date default (current_date - 30),
  p_to_date date default current_date
)
returns table (
  usage_date date,
  unique_visitors bigint,
  new_visitors bigint,
  returning_visitors bigint,
  sessions bigint,
  sessions_per_visitor numeric,
  wallet_connected_visitors bigint,
  engaged_sessions bigint,
  view_count bigint,
  total_active_seconds bigint,
  average_active_seconds numeric,
  median_active_seconds numeric
)
language sql
security invoker
set search_path = public
as $$
  with raw_sessions as (
    select
      s.*,
      (s.started_at at time zone 'Asia/Seoul')::date as usage_date
    from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date between p_from_date and p_to_date
  ),
  raw_visitor_flags as (
    select
      usage_date,
      visitor_key,
      bool_or(returning_visitor) as is_returning
    from raw_sessions
    group by usage_date, visitor_key
  ),
  raw_visitor_metrics as (
    select
      usage_date,
      count(*)::bigint as unique_visitors,
      count(*) filter (where not is_returning)::bigint as new_visitors,
      count(*) filter (where is_returning)::bigint as returning_visitors
    from raw_visitor_flags
    group by usage_date
  ),
  raw_session_metrics as (
    select
      usage_date,
      count(*)::bigint as sessions,
      count(distinct visitor_key) filter (where wallet_connected)::bigint as wallet_connected_visitors,
      count(*) filter (where active_seconds >= 30)::bigint as engaged_sessions,
      coalesce(sum(view_count), 0)::bigint as view_count,
      coalesce(sum(active_seconds), 0)::bigint as total_active_seconds,
      coalesce(round(avg(active_seconds)::numeric, 1), 0::numeric) as average_active_seconds,
      coalesce(round(percentile_cont(0.5) within group (order by active_seconds)::numeric, 1), 0::numeric) as median_active_seconds
    from raw_sessions
    group by usage_date
  ),
  raw_daily as (
    select
      v.usage_date,
      v.unique_visitors,
      v.new_visitors,
      v.returning_visitors,
      s.sessions,
      s.wallet_connected_visitors,
      s.engaged_sessions,
      s.view_count,
      s.total_active_seconds,
      s.average_active_seconds,
      s.median_active_seconds
    from raw_visitor_metrics v
    join raw_session_metrics s using (usage_date)
  ),
  combined as (
    select
      r.usage_date,
      r.unique_visitors,
      r.new_visitors,
      r.returning_visitors,
      r.sessions,
      r.wallet_connected_visitors,
      r.engaged_sessions,
      r.view_count,
      r.total_active_seconds,
      r.average_active_seconds,
      r.median_active_seconds
    from public.app_usage_daily_rollups r
    where r.usage_date between p_from_date and p_to_date

    union all

    select
      d.usage_date,
      d.unique_visitors,
      d.new_visitors,
      d.returning_visitors,
      d.sessions,
      d.wallet_connected_visitors,
      d.engaged_sessions,
      d.view_count,
      d.total_active_seconds,
      d.average_active_seconds,
      d.median_active_seconds
    from raw_daily d
    where not exists (
      select 1
      from public.app_usage_daily_rollups r
      where r.usage_date = d.usage_date
    )
  )
  select
    c.usage_date,
    c.unique_visitors,
    c.new_visitors,
    c.returning_visitors,
    c.sessions,
    case
      when c.unique_visitors = 0 then 0::numeric
      else round(c.sessions::numeric / c.unique_visitors::numeric, 2)
    end as sessions_per_visitor,
    c.wallet_connected_visitors,
    c.engaged_sessions,
    c.view_count,
    c.total_active_seconds,
    c.average_active_seconds,
    c.median_active_seconds
  from combined c
  order by c.usage_date desc;
$$;

revoke all on function public.read_app_usage_daily_summary(date, date)
  from public, anon, authenticated;
grant execute on function public.read_app_usage_daily_summary(date, date)
  to service_role;

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
  with raw as (
    select
      case p_dimension
        when 'locale' then s.current_locale
        when 'device' then s.device_bucket
        when 'source' then s.acquisition_source
        else null
      end as dimension_value,
      count(*)::bigint as sessions,
      count(distinct s.visitor_key)::bigint as unique_visitors,
      coalesce(sum(s.active_seconds), 0)::bigint as total_active_seconds
    from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date between p_from_date and p_to_date
      and p_dimension in ('locale', 'device', 'source')
    group by 1
  ),
  rolled as (
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
    sum(x.sessions)::bigint as sessions,
    sum(x.unique_visitors)::bigint as unique_visitors,
    sum(x.total_active_seconds)::bigint as total_active_seconds
  from (
    select * from raw
    union all
    select * from rolled
  ) x
  where x.dimension_value is not null
  group by x.dimension_value
  order by sessions desc, x.dimension_value asc;
$$;

revoke all on function public.read_app_usage_dimension_breakdown(date, date, text)
  from public, anon, authenticated;
grant execute on function public.read_app_usage_dimension_breakdown(date, date, text)
  to service_role;
