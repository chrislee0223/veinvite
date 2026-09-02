create table if not exists public.app_usage_sessions (
  session_id uuid primary key,
  visitor_key text not null check (visitor_key ~ '^[0-9a-f]{64}$'),
  wallet_key text null check (wallet_key is null or wallet_key ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz null,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  page_view_count integer not null default 1 check (page_view_count >= 1),
  entry_path text not null default '/',
  last_path text not null default '/',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_usage_sessions is 'Privacy-safe VeInvite usage sessions. Stores hashed anonymous visitor/wallet identifiers only; no raw IP or user-agent data.';

create index if not exists app_usage_sessions_started_at_idx
  on public.app_usage_sessions (started_at desc);
create index if not exists app_usage_sessions_visitor_started_idx
  on public.app_usage_sessions (visitor_key, started_at desc);
create index if not exists app_usage_sessions_wallet_started_idx
  on public.app_usage_sessions (wallet_key, started_at desc)
  where wallet_key is not null;

alter table public.app_usage_sessions enable row level security;
revoke all on table public.app_usage_sessions from anon, authenticated;
grant select, insert, update, delete on table public.app_usage_sessions to service_role;

create or replace function public.read_app_usage_daily_summary(
  p_from_date date default (current_date - 30),
  p_to_date date default current_date
)
returns table (
  usage_date date,
  unique_visitors bigint,
  sessions bigint,
  returning_visitors bigint,
  wallet_connected_visitors bigint,
  page_views bigint,
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
  first_seen as (
    select visitor_key, min((started_at at time zone 'Asia/Seoul')::date) as first_usage_date
    from public.app_usage_sessions
    group by visitor_key
  )
  select
    x.usage_date,
    count(distinct x.visitor_key)::bigint as unique_visitors,
    count(*)::bigint as sessions,
    count(distinct x.visitor_key) filter (where f.first_usage_date < x.usage_date)::bigint as returning_visitors,
    count(distinct x.visitor_key) filter (where x.wallet_key is not null)::bigint as wallet_connected_visitors,
    coalesce(sum(x.page_view_count), 0)::bigint as page_views,
    coalesce(sum(x.active_seconds), 0)::bigint as total_active_seconds,
    round(avg(x.active_seconds)::numeric, 1) as average_active_seconds,
    round(percentile_cont(0.5) within group (order by x.active_seconds)::numeric, 1) as median_active_seconds
  from scoped x
  join first_seen f using (visitor_key)
  group by x.usage_date
  order by x.usage_date desc;
$$;

revoke all on function public.read_app_usage_daily_summary(date, date) from public, anon, authenticated;
grant execute on function public.read_app_usage_daily_summary(date, date) to service_role;
