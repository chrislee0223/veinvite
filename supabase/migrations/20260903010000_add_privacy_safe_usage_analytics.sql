create table if not exists public.app_usage_visitors (
  visitor_key text primary key check (visitor_key ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

comment on table public.app_usage_visitors is
  'Privacy-safe anonymous VeInvite visitor registry. visitor_key is a server-side SHA-256 digest of a random browser identifier; no raw IP, user-agent, wallet address, invite code, or query string is stored.';

create table if not exists public.app_usage_sessions (
  session_id uuid primary key,
  visitor_key text not null references public.app_usage_visitors(visitor_key),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz null,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  view_count integer not null default 0 check (view_count >= 0),
  entry_view text not null check (
    entry_view in ('home', 'guide', 'leaderboard', 'settings', 'invite_landing', 'privacy', 'terms', 'other')
  ),
  last_view text not null check (
    last_view in ('home', 'guide', 'leaderboard', 'settings', 'invite_landing', 'privacy', 'terms', 'other')
  ),
  initial_locale text not null check (initial_locale ~ '^[a-z]{2,3}(-[a-z]{2})?$'),
  current_locale text not null check (current_locale ~ '^[a-z]{2,3}(-[a-z]{2})?$'),
  device_bucket text not null check (device_bucket in ('mobile', 'tablet', 'desktop')),
  acquisition_source text not null check (
    acquisition_source in ('direct', 'x', 'telegram', 'search', 'vechain', 'other')
  ),
  wallet_connected boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.app_usage_sessions is
  'Minimal first-party VeInvite usage sessions for aggregate product analytics. Engaged time counts only foreground/focused activity. Analytics is observational only and is never reward, referral, eligibility, or Sybil authority.';

create table if not exists public.app_usage_daily_view_counts (
  usage_date date not null,
  view_name text not null check (
    view_name in ('home', 'guide', 'leaderboard', 'settings', 'invite_landing', 'privacy', 'terms', 'other')
  ),
  view_count bigint not null default 0 check (view_count >= 0),
  primary key (usage_date, view_name)
);

comment on table public.app_usage_daily_view_counts is
  'Identifier-free daily aggregate counts for VeInvite app sections. Dates use Asia/Seoul calendar days.';

create index if not exists app_usage_visitors_last_seen_idx
  on public.app_usage_visitors (last_seen_at desc);
create index if not exists app_usage_sessions_started_at_idx
  on public.app_usage_sessions (started_at desc);
create index if not exists app_usage_sessions_visitor_started_idx
  on public.app_usage_sessions (visitor_key, started_at desc);
create index if not exists app_usage_sessions_wallet_started_idx
  on public.app_usage_sessions (started_at desc)
  where wallet_connected = true;

alter table public.app_usage_visitors enable row level security;
alter table public.app_usage_sessions enable row level security;
alter table public.app_usage_daily_view_counts enable row level security;

revoke all on table public.app_usage_visitors from public, anon, authenticated;
revoke all on table public.app_usage_sessions from public, anon, authenticated;
revoke all on table public.app_usage_daily_view_counts from public, anon, authenticated;

grant select, insert, update, delete on table public.app_usage_visitors to service_role;
grant select, insert, update, delete on table public.app_usage_sessions to service_role;
grant select, insert, update, delete on table public.app_usage_daily_view_counts to service_role;

create or replace function public.record_app_usage_event(
  p_session_id uuid,
  p_visitor_key text,
  p_kind text,
  p_view_name text,
  p_locale text,
  p_device_bucket text,
  p_acquisition_source text,
  p_active_delta_seconds integer,
  p_wallet_connected boolean default false
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

revoke all on function public.record_app_usage_event(uuid, text, text, text, text, text, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.record_app_usage_event(uuid, text, text, text, text, text, text, integer, boolean)
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
  with scoped as (
    select
      s.*,
      (s.started_at at time zone 'Asia/Seoul')::date as usage_date
    from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date between p_from_date and p_to_date
  ),
  daily as (
    select
      x.usage_date,
      count(distinct x.visitor_key)::bigint as unique_visitors,
      count(distinct x.visitor_key) filter (
        where (v.first_seen_at at time zone 'Asia/Seoul')::date = x.usage_date
      )::bigint as new_visitors,
      count(distinct x.visitor_key) filter (
        where (v.first_seen_at at time zone 'Asia/Seoul')::date < x.usage_date
      )::bigint as returning_visitors,
      count(*)::bigint as sessions,
      count(distinct x.visitor_key) filter (where x.wallet_connected)::bigint as wallet_connected_visitors,
      count(*) filter (where x.active_seconds >= 30)::bigint as engaged_sessions,
      coalesce(sum(x.view_count), 0)::bigint as view_count,
      coalesce(sum(x.active_seconds), 0)::bigint as total_active_seconds,
      round(avg(x.active_seconds)::numeric, 1) as average_active_seconds,
      round(percentile_cont(0.5) within group (order by x.active_seconds)::numeric, 1) as median_active_seconds
    from scoped x
    join public.app_usage_visitors v using (visitor_key)
    group by x.usage_date
  )
  select
    d.usage_date,
    d.unique_visitors,
    d.new_visitors,
    d.returning_visitors,
    d.sessions,
    case
      when d.unique_visitors = 0 then 0::numeric
      else round(d.sessions::numeric / d.unique_visitors::numeric, 2)
    end as sessions_per_visitor,
    d.wallet_connected_visitors,
    d.engaged_sessions,
    d.view_count,
    d.total_active_seconds,
    d.average_active_seconds,
    d.median_active_seconds
  from daily d
  order by d.usage_date desc;
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
  order by sessions desc, dimension_value asc;
$$;

revoke all on function public.read_app_usage_dimension_breakdown(date, date, text)
  from public, anon, authenticated;
grant execute on function public.read_app_usage_dimension_breakdown(date, date, text)
  to service_role;

create or replace function public.read_app_usage_view_breakdown(
  p_from_date date,
  p_to_date date
)
returns table (
  view_name text,
  view_count bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    d.view_name,
    sum(d.view_count)::bigint as view_count
  from public.app_usage_daily_view_counts d
  where d.usage_date between p_from_date and p_to_date
  group by d.view_name
  order by view_count desc, d.view_name asc;
$$;

revoke all on function public.read_app_usage_view_breakdown(date, date)
  from public, anon, authenticated;
grant execute on function public.read_app_usage_view_breakdown(date, date)
  to service_role;
