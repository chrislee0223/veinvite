-- Harden VeInvite usage analytics before expanding the product funnel.
--
-- 1. Make session timestamps monotonic under concurrent/out-of-order requests.
-- 2. Mark the 2026-09-03 bootstrap-day view breakdown as incomplete rather
--    than silently reporting administrator views that predate the per-session
--    exclusion ledger.
-- 3. Expose data-quality exclusions to the operator report.

begin;

update public.app_usage_sessions
set
  last_seen_at = greatest(last_seen_at, started_at),
  ended_at = case
    when ended_at is null then null
    else greatest(ended_at, started_at)
  end,
  updated_at = greatest(updated_at, started_at)
where
  last_seen_at < started_at
  or (ended_at is not null and ended_at < started_at)
  or updated_at < started_at;

alter table public.app_usage_sessions
  drop constraint if exists app_usage_sessions_last_seen_not_before_start_chk,
  add constraint app_usage_sessions_last_seen_not_before_start_chk
    check (last_seen_at >= started_at),
  drop constraint if exists app_usage_sessions_end_not_before_start_chk,
  add constraint app_usage_sessions_end_not_before_start_chk
    check (ended_at is null or ended_at >= started_at),
  drop constraint if exists app_usage_sessions_updated_not_before_start_chk,
  add constraint app_usage_sessions_updated_not_before_start_chk
    check (updated_at >= started_at);

create table if not exists public.app_usage_metric_quality_exclusions (
  metric_name text not null check (
    metric_name in ('view_breakdown')
  ),
  usage_date date not null,
  reason_code text not null check (
    reason_code in ('legacy_admin_view_ledger_unavailable')
  ),
  created_at timestamptz not null default now(),
  primary key (metric_name, usage_date)
);

comment on table public.app_usage_metric_quality_exclusions is
  'Operator-visible quality markers for aggregate analytics that cannot be reconstructed exactly. Contains dates/reason codes only, never visitor or wallet identity.';

alter table public.app_usage_metric_quality_exclusions enable row level security;
revoke all on table public.app_usage_metric_quality_exclusions
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.app_usage_metric_quality_exclusions
  to service_role;

insert into public.app_usage_metric_quality_exclusions (
  metric_name,
  usage_date,
  reason_code
) values (
  'view_breakdown',
  date '2026-09-03',
  'legacy_admin_view_ledger_unavailable'
)
on conflict (metric_name, usage_date) do nothing;

create or replace function public.read_app_usage_quality_exclusions(
  p_from_date date,
  p_to_date date
)
returns table (
  metric_name text,
  usage_date date,
  reason_code text
)
language sql
security invoker
set search_path = public
as $$
  select
    q.metric_name,
    q.usage_date,
    q.reason_code
  from public.app_usage_metric_quality_exclusions q
  where q.usage_date between p_from_date and p_to_date
  order by q.usage_date asc, q.metric_name asc;
$$;

revoke all on function public.read_app_usage_quality_exclusions(date, date)
  from public, anon, authenticated;
grant execute on function public.read_app_usage_quality_exclusions(date, date)
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
    and not exists (
      select 1
      from public.app_usage_metric_quality_exclusions q
      where q.metric_name = 'view_breakdown'
        and q.usage_date = d.usage_date
    )
  group by d.view_name
  order by view_count desc, d.view_name asc;
$$;

revoke all on function public.read_app_usage_view_breakdown(date, date)
  from public, anon, authenticated;
grant execute on function public.read_app_usage_view_breakdown(date, date)
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
  v_now timestamptz;
  v_usage_date date;
  v_view_increment integer := case
    when p_kind in ('start', 'pageview') then 1
    else 0
  end;
begin
  if p_visitor_key !~ '^[0-9a-f]{64}$' then
    raise exception 'visitor key is malformed';
  end if;
  if p_kind not in ('start', 'pageview', 'heartbeat', 'end') then
    raise exception 'usage event kind is unsupported';
  end if;
  if p_view_name not in (
    'home', 'guide', 'leaderboard', 'settings',
    'invite_landing', 'privacy', 'terms', 'other'
  ) then
    raise exception 'usage view is unsupported';
  end if;
  if p_locale !~ '^[a-z]{2,3}(-[a-z]{2})?$' then
    raise exception 'usage locale is malformed';
  end if;
  if p_device_bucket not in ('mobile', 'tablet', 'desktop') then
    raise exception 'usage device bucket is unsupported';
  end if;
  if p_acquisition_source not in (
    'direct', 'x', 'telegram', 'search', 'vechain', 'other'
  ) then
    raise exception 'usage acquisition source is unsupported';
  end if;
  if p_active_delta_seconds < 0 or p_active_delta_seconds > 90 then
    raise exception 'active usage delta is out of bounds';
  end if;

  -- Serialize all writes for one anonymous daily visitor. clock_timestamp()
  -- is intentionally read only after the lock: transaction-level now() can be
  -- older than a request that committed first while this request was waiting.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_visitor_key, 0)
  );

  v_now := clock_timestamp();
  v_usage_date := (v_now at time zone 'Asia/Seoul')::date;

  if exists (
    select 1
    from public.app_usage_excluded_visitors x
    where x.visitor_key = p_visitor_key
  ) then
    return;
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
  set last_seen_at = greatest(
    public.app_usage_visitors.last_seen_at,
    excluded.last_seen_at
  );

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
    last_seen_at = greatest(
      public.app_usage_sessions.last_seen_at,
      v_now
    ),
    ended_at = case
      when p_kind = 'end' then greatest(
        coalesce(
          public.app_usage_sessions.ended_at,
          public.app_usage_sessions.started_at
        ),
        public.app_usage_sessions.started_at,
        v_now
      )
      when p_kind = 'start' then null
      else public.app_usage_sessions.ended_at
    end,
    active_seconds = least(
      2147483647,
      public.app_usage_sessions.active_seconds + p_active_delta_seconds
    ),
    view_count = public.app_usage_sessions.view_count + v_view_increment,
    last_view = case
      when v_now >= public.app_usage_sessions.last_seen_at then p_view_name
      else public.app_usage_sessions.last_view
    end,
    current_locale = case
      when v_now >= public.app_usage_sessions.last_seen_at then p_locale
      else public.app_usage_sessions.current_locale
    end,
    device_bucket = case
      when v_now >= public.app_usage_sessions.last_seen_at then p_device_bucket
      else public.app_usage_sessions.device_bucket
    end,
    wallet_connected =
      public.app_usage_sessions.wallet_connected
      or coalesce(p_wallet_connected, false),
    returning_visitor =
      public.app_usage_sessions.returning_visitor
      or coalesce(p_returning_visitor, false),
    updated_at = greatest(
      public.app_usage_sessions.updated_at,
      public.app_usage_sessions.started_at,
      v_now
    )
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

    insert into public.app_usage_session_view_counts (
      session_id,
      visitor_key,
      usage_date,
      view_name,
      view_count
    ) values (
      p_session_id,
      p_visitor_key,
      v_usage_date,
      p_view_name,
      1
    )
    on conflict (session_id, view_name) do update
    set view_count = public.app_usage_session_view_counts.view_count + 1
    where public.app_usage_session_view_counts.visitor_key = excluded.visitor_key;
  end if;
end;
$$;

revoke all on function public.record_app_usage_event(
  uuid, text, text, text, text, text, text, integer, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.record_app_usage_event(
  uuid, text, text, text, text, text, text, integer, boolean, boolean
) to service_role;

commit;
