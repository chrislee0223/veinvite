-- Privacy-safe, non-authoritative product funnel analytics for VeInvite.
--
-- This layer records only a strict allowlist of coarse UI/product events. It
-- deliberately has no wallet address, invite/referral code, query string,
-- free-form metadata, raw URL, IP address or user-agent column. Raw anonymous
-- events retain the same daily browser identity boundary as usage analytics and
-- are compacted after 30 Seoul-calendar days into identifier-free rollups.

begin;

create table if not exists public.app_product_events (
  event_id uuid primary key,
  visitor_key text not null check (visitor_key ~ '^[0-9a-f]{64}$'),
  session_id uuid not null,
  event_sequence integer not null check (
    event_sequence >= 1 and event_sequence <= 10000
  ),
  usage_date date not null,
  event_name text not null check (
    event_name in (
      'wallet_connect_started',
      'wallet_auth_succeeded',
      'wallet_auth_failed',
      'invite_link_copied',
      'invite_link_shared',
      'invite_accept_started',
      'invite_accept_succeeded',
      'invite_accept_review',
      'invite_accept_failed',
      'mission_action_opened',
      'reward_claim_started',
      'reward_claim_succeeded',
      'reward_claim_failed'
    )
  ),
  view_name text not null check (
    view_name in (
      'home', 'guide', 'leaderboard', 'settings', 'invite_landing',
      'privacy', 'terms', 'other'
    )
  ),
  locale text not null check (locale ~ '^[a-z]{2,3}(-[a-z]{2})?$'),
  device_bucket text not null check (
    device_bucket in ('mobile', 'tablet', 'desktop')
  ),
  acquisition_source text not null check (
    acquisition_source in ('direct', 'x', 'telegram', 'search', 'vechain', 'other')
  ),
  outcome text not null default 'none' check (
    outcome in ('none', 'success', 'failure', 'review', 'cancelled')
  ),
  failure_code text not null default 'none' check (
    failure_code in (
      'none', 'invalid_link', 'slots_full', 'existing_user',
      'self_referral', 'already_referred', 'already_used', 'eligibility',
      'network', 'server', 'malformed_response', 'wallet_auth', 'unknown'
    )
  ),
  mission_key text not null default 'none' check (
    mission_key in ('none', 'vebetter_apps', 'governance_vote')
  ),
  flow_key text not null default 'none' check (
    flow_key in ('none', 'home', 'permanent_referral', 'legacy_invite')
  ),
  entry_class text not null default 'none' check (
    entry_class in ('none', 'new_user', 'returning_user')
  ),
  build_id text not null check (
    build_id = 'unknown' or build_id ~ '^[0-9a-f]{7,64}$'
  ),
  schema_version smallint not null default 1 check (schema_version = 1),
  received_at timestamptz not null default now(),
  unique (session_id, event_sequence)
);

comment on table public.app_product_events is
  '30-day raw privacy-safe VeInvite product events. Anonymous analytics only; never reward, referral, eligibility, mission, Sybil or payout authority.';

create index if not exists app_product_events_date_event_idx
  on public.app_product_events (usage_date, event_name);
create index if not exists app_product_events_visitor_idx
  on public.app_product_events (visitor_key, usage_date);
create index if not exists app_product_events_build_idx
  on public.app_product_events (build_id, usage_date);

create table if not exists public.app_product_event_daily_rollups (
  usage_date date not null,
  event_name text not null,
  outcome text not null,
  failure_code text not null,
  mission_key text not null,
  flow_key text not null,
  entry_class text not null,
  build_id text not null,
  event_count bigint not null check (event_count >= 0),
  finalized_at timestamptz not null default now(),
  primary key (
    usage_date,
    event_name,
    outcome,
    failure_code,
    mission_key,
    flow_key,
    entry_class,
    build_id
  )
);

comment on table public.app_product_event_daily_rollups is
  'Identifier-free long-term VeInvite product funnel totals finalized before raw product events are deleted.';

create table if not exists public.app_product_event_daily_dimension_rollups (
  usage_date date not null,
  event_name text not null,
  dimension_name text not null check (
    dimension_name in ('locale', 'device', 'source')
  ),
  dimension_value text not null,
  event_count bigint not null check (event_count >= 0),
  finalized_at timestamptz not null default now(),
  primary key (
    usage_date,
    event_name,
    dimension_name,
    dimension_value
  )
);

comment on table public.app_product_event_daily_dimension_rollups is
  'Identifier-free long-term locale/device/source product event totals.';

alter table public.app_product_events enable row level security;
alter table public.app_product_event_daily_rollups enable row level security;
alter table public.app_product_event_daily_dimension_rollups enable row level security;

revoke all on table public.app_product_events from public, anon, authenticated;
revoke all on table public.app_product_event_daily_rollups from public, anon, authenticated;
revoke all on table public.app_product_event_daily_dimension_rollups from public, anon, authenticated;

grant select, insert, update, delete on table public.app_product_events to service_role;
grant select, insert, update, delete on table public.app_product_event_daily_rollups to service_role;
grant select, insert, update, delete on table public.app_product_event_daily_dimension_rollups to service_role;

create or replace function public.record_app_product_event(
  p_event_id uuid,
  p_visitor_key text,
  p_session_id uuid,
  p_event_sequence integer,
  p_event_name text,
  p_view_name text,
  p_locale text,
  p_device_bucket text,
  p_acquisition_source text,
  p_outcome text,
  p_failure_code text,
  p_mission_key text,
  p_flow_key text,
  p_entry_class text,
  p_build_id text,
  p_schema_version smallint default 1
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz;
  v_usage_date date;
begin
  if p_visitor_key !~ '^[0-9a-f]{64}$' then
    raise exception 'visitor key is malformed';
  end if;
  if p_event_sequence < 1 or p_event_sequence > 10000 then
    raise exception 'product event sequence is out of bounds';
  end if;
  if p_event_name not in (
    'wallet_connect_started', 'wallet_auth_succeeded', 'wallet_auth_failed',
    'invite_link_copied', 'invite_link_shared', 'invite_accept_started',
    'invite_accept_succeeded', 'invite_accept_review', 'invite_accept_failed',
    'mission_action_opened', 'reward_claim_started',
    'reward_claim_succeeded', 'reward_claim_failed'
  ) then
    raise exception 'product event name is unsupported';
  end if;
  if p_view_name not in (
    'home', 'guide', 'leaderboard', 'settings', 'invite_landing',
    'privacy', 'terms', 'other'
  ) then
    raise exception 'product event view is unsupported';
  end if;
  if p_locale !~ '^[a-z]{2,3}(-[a-z]{2})?$' then
    raise exception 'product event locale is malformed';
  end if;
  if p_device_bucket not in ('mobile', 'tablet', 'desktop') then
    raise exception 'product event device is unsupported';
  end if;
  if p_acquisition_source not in (
    'direct', 'x', 'telegram', 'search', 'vechain', 'other'
  ) then
    raise exception 'product event source is unsupported';
  end if;
  if p_outcome not in ('none', 'success', 'failure', 'review', 'cancelled') then
    raise exception 'product event outcome is unsupported';
  end if;
  if p_failure_code not in (
    'none', 'invalid_link', 'slots_full', 'existing_user',
    'self_referral', 'already_referred', 'already_used', 'eligibility',
    'network', 'server', 'malformed_response', 'wallet_auth', 'unknown'
  ) then
    raise exception 'product event failure code is unsupported';
  end if;
  if p_mission_key not in ('none', 'vebetter_apps', 'governance_vote') then
    raise exception 'product event mission key is unsupported';
  end if;
  if p_flow_key not in ('none', 'home', 'permanent_referral', 'legacy_invite') then
    raise exception 'product event flow key is unsupported';
  end if;
  if p_entry_class not in ('none', 'new_user', 'returning_user') then
    raise exception 'product event entry class is unsupported';
  end if;
  if p_build_id <> 'unknown' and p_build_id !~ '^[0-9a-f]{7,64}$' then
    raise exception 'product event build id is malformed';
  end if;
  if p_schema_version <> 1 then
    raise exception 'product analytics schema version is unsupported';
  end if;

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

  v_now := clock_timestamp();
  v_usage_date := (v_now at time zone 'Asia/Seoul')::date;

  insert into public.app_product_events (
    event_id,
    visitor_key,
    session_id,
    event_sequence,
    usage_date,
    event_name,
    view_name,
    locale,
    device_bucket,
    acquisition_source,
    outcome,
    failure_code,
    mission_key,
    flow_key,
    entry_class,
    build_id,
    schema_version,
    received_at
  ) values (
    p_event_id,
    p_visitor_key,
    p_session_id,
    p_event_sequence,
    v_usage_date,
    p_event_name,
    p_view_name,
    p_locale,
    p_device_bucket,
    p_acquisition_source,
    p_outcome,
    p_failure_code,
    p_mission_key,
    p_flow_key,
    p_entry_class,
    p_build_id,
    p_schema_version,
    v_now
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.record_app_product_event(
  uuid, text, uuid, integer, text, text, text, text, text,
  text, text, text, text, text, text, smallint
) from public, anon, authenticated;
grant execute on function public.record_app_product_event(
  uuid, text, uuid, integer, text, text, text, text, text,
  text, text, text, text, text, text, smallint
) to service_role;

-- Extend the existing administrator exclusion with product-event cleanup. The
-- anonymous visitor is resolved only after wallet authentication; deleting raw
-- product events here also removes any pre-authentication operator clicks.
create or replace function public.exclude_app_usage_visitor(
  p_visitor_key text
)
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

  insert into public.app_usage_excluded_visitors (
    visitor_key,
    excluded_at,
    reason
  ) values (
    p_visitor_key,
    clock_timestamp(),
    'ADMIN_WALLET'
  )
  on conflict (visitor_key) do nothing;
  v_inserted := found;

  for v_row in
    select usage_date, view_name, sum(view_count)::bigint as view_count
    from public.app_usage_session_view_counts
    where visitor_key = p_visitor_key
    group by usage_date, view_name
  loop
    update public.app_usage_daily_view_counts d
    set view_count = greatest(
      0::bigint,
      d.view_count - v_row.view_count
    )
    where d.usage_date = v_row.usage_date
      and d.view_name = v_row.view_name;
  end loop;

  delete from public.app_usage_session_view_counts
  where visitor_key = p_visitor_key;

  delete from public.app_product_events
  where visitor_key = p_visitor_key;

  return v_inserted;
end;
$$;

revoke all on function public.exclude_app_usage_visitor(text)
  from public, anon, authenticated;
grant execute on function public.exclude_app_usage_visitor(text)
  to service_role;

create or replace function public.compact_app_product_analytics(
  p_retention_days integer default 30
)
returns table (
  compacted_days integer,
  events_deleted bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cutoff_date date;
  v_usage_date date;
  v_compacted_days integer := 0;
  v_events_deleted bigint := 0;
  v_deleted bigint := 0;
begin
  if p_retention_days < 7 or p_retention_days > 365 then
    raise exception 'product analytics retention days must be between 7 and 365';
  end if;

  v_cutoff_date :=
    (clock_timestamp() at time zone 'Asia/Seoul')::date - p_retention_days;

  for v_usage_date in
    select distinct e.usage_date
    from public.app_product_events e
    where e.usage_date <= v_cutoff_date
    order by e.usage_date
  loop
    insert into public.app_product_event_daily_rollups (
      usage_date,
      event_name,
      outcome,
      failure_code,
      mission_key,
      flow_key,
      entry_class,
      build_id,
      event_count,
      finalized_at
    )
    select
      v_usage_date,
      e.event_name,
      e.outcome,
      e.failure_code,
      e.mission_key,
      e.flow_key,
      e.entry_class,
      e.build_id,
      count(*)::bigint,
      clock_timestamp()
    from public.app_product_events e
    where e.usage_date = v_usage_date
      and not exists (
        select 1
        from public.app_usage_excluded_visitors x
        where x.visitor_key = e.visitor_key
      )
    group by
      e.event_name,
      e.outcome,
      e.failure_code,
      e.mission_key,
      e.flow_key,
      e.entry_class,
      e.build_id
    on conflict (
      usage_date,
      event_name,
      outcome,
      failure_code,
      mission_key,
      flow_key,
      entry_class,
      build_id
    ) do update
    set
      event_count = excluded.event_count,
      finalized_at = excluded.finalized_at;

    delete from public.app_product_event_daily_dimension_rollups
    where usage_date = v_usage_date;

    insert into public.app_product_event_daily_dimension_rollups (
      usage_date,
      event_name,
      dimension_name,
      dimension_value,
      event_count,
      finalized_at
    )
    select
      v_usage_date,
      e.event_name,
      d.dimension_name,
      d.dimension_value,
      count(*)::bigint,
      clock_timestamp()
    from public.app_product_events e
    cross join lateral (
      values
        ('locale'::text, e.locale),
        ('device'::text, e.device_bucket),
        ('source'::text, e.acquisition_source)
    ) as d(dimension_name, dimension_value)
    where e.usage_date = v_usage_date
      and not exists (
        select 1
        from public.app_usage_excluded_visitors x
        where x.visitor_key = e.visitor_key
      )
    group by e.event_name, d.dimension_name, d.dimension_value;

    delete from public.app_product_events
    where usage_date = v_usage_date;
    get diagnostics v_deleted = row_count;
    v_events_deleted := v_events_deleted + v_deleted;
    v_compacted_days := v_compacted_days + 1;
  end loop;

  return query
  select v_compacted_days, v_events_deleted;
end;
$$;

revoke all on function public.compact_app_product_analytics(integer)
  from public, anon, authenticated;
grant execute on function public.compact_app_product_analytics(integer)
  to service_role;

create or replace function public.read_app_product_event_summary(
  p_from_date date,
  p_to_date date
)
returns table (
  event_name text,
  outcome text,
  failure_code text,
  mission_key text,
  flow_key text,
  entry_class text,
  build_id text,
  event_count bigint
)
language sql
security invoker
set search_path = public
as $$
  with finalized as (
    select
      r.event_name,
      r.outcome,
      r.failure_code,
      r.mission_key,
      r.flow_key,
      r.entry_class,
      r.build_id,
      sum(r.event_count)::bigint as event_count
    from public.app_product_event_daily_rollups r
    where r.usage_date between p_from_date and p_to_date
    group by
      r.event_name,
      r.outcome,
      r.failure_code,
      r.mission_key,
      r.flow_key,
      r.entry_class,
      r.build_id
  ),
  raw as (
    select
      e.event_name,
      e.outcome,
      e.failure_code,
      e.mission_key,
      e.flow_key,
      e.entry_class,
      e.build_id,
      count(*)::bigint as event_count
    from public.app_product_events e
    where e.usage_date between p_from_date and p_to_date
      and not exists (
        select 1
        from public.app_product_event_daily_rollups r
        where r.usage_date = e.usage_date
      )
      and not exists (
        select 1
        from public.app_usage_excluded_visitors x
        where x.visitor_key = e.visitor_key
      )
    group by
      e.event_name,
      e.outcome,
      e.failure_code,
      e.mission_key,
      e.flow_key,
      e.entry_class,
      e.build_id
  ),
  combined as (
    select * from finalized
    union all
    select * from raw
  )
  select
    c.event_name,
    c.outcome,
    c.failure_code,
    c.mission_key,
    c.flow_key,
    c.entry_class,
    c.build_id,
    sum(c.event_count)::bigint as event_count
  from combined c
  group by
    c.event_name,
    c.outcome,
    c.failure_code,
    c.mission_key,
    c.flow_key,
    c.entry_class,
    c.build_id
  order by event_count desc, c.event_name asc;
$$;

revoke all on function public.read_app_product_event_summary(date, date)
  from public, anon, authenticated;
grant execute on function public.read_app_product_event_summary(date, date)
  to service_role;

create or replace function public.read_app_product_event_daily_summary(
  p_from_date date,
  p_to_date date
)
returns table (
  usage_date date,
  event_name text,
  outcome text,
  event_count bigint
)
language sql
security invoker
set search_path = public
as $$
  with finalized as (
    select
      r.usage_date,
      r.event_name,
      r.outcome,
      sum(r.event_count)::bigint as event_count
    from public.app_product_event_daily_rollups r
    where r.usage_date between p_from_date and p_to_date
    group by r.usage_date, r.event_name, r.outcome
  ),
  raw as (
    select
      e.usage_date,
      e.event_name,
      e.outcome,
      count(*)::bigint as event_count
    from public.app_product_events e
    where e.usage_date between p_from_date and p_to_date
      and not exists (
        select 1
        from public.app_product_event_daily_rollups r
        where r.usage_date = e.usage_date
      )
      and not exists (
        select 1
        from public.app_usage_excluded_visitors x
        where x.visitor_key = e.visitor_key
      )
    group by e.usage_date, e.event_name, e.outcome
  )
  select * from finalized
  union all
  select * from raw
  order by usage_date desc, event_name asc, outcome asc;
$$;

revoke all on function public.read_app_product_event_daily_summary(date, date)
  from public, anon, authenticated;
grant execute on function public.read_app_product_event_daily_summary(date, date)
  to service_role;

create or replace function public.read_app_product_event_dimension_breakdown(
  p_from_date date,
  p_to_date date,
  p_dimension text
)
returns table (
  event_name text,
  dimension_value text,
  event_count bigint
)
language sql
security invoker
set search_path = public
as $$
  with finalized as (
    select
      r.event_name,
      r.dimension_value,
      sum(r.event_count)::bigint as event_count
    from public.app_product_event_daily_dimension_rollups r
    where r.usage_date between p_from_date and p_to_date
      and r.dimension_name = p_dimension
      and p_dimension in ('locale', 'device', 'source')
    group by r.event_name, r.dimension_value
  ),
  raw as (
    select
      e.event_name,
      case p_dimension
        when 'locale' then e.locale
        when 'device' then e.device_bucket
        when 'source' then e.acquisition_source
        else null
      end as dimension_value,
      count(*)::bigint as event_count
    from public.app_product_events e
    where e.usage_date between p_from_date and p_to_date
      and p_dimension in ('locale', 'device', 'source')
      and not exists (
        select 1
        from public.app_product_event_daily_rollups r
        where r.usage_date = e.usage_date
      )
      and not exists (
        select 1
        from public.app_usage_excluded_visitors x
        where x.visitor_key = e.visitor_key
      )
    group by e.event_name, 2
  ),
  combined as (
    select * from finalized
    union all
    select * from raw
  )
  select
    c.event_name,
    c.dimension_value,
    sum(c.event_count)::bigint as event_count
  from combined c
  where c.dimension_value is not null
  group by c.event_name, c.dimension_value
  order by c.event_name asc, event_count desc, c.dimension_value asc;
$$;

revoke all on function public.read_app_product_event_dimension_breakdown(date, date, text)
  from public, anon, authenticated;
grant execute on function public.read_app_product_event_dimension_breakdown(date, date, text)
  to service_role;

commit;
