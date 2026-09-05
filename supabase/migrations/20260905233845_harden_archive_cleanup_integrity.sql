begin;

create or replace function public.enforce_archive_manifest_event_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_previous_status text;
begin
  -- Serialize lifecycle changes for one manifest so concurrent workers cannot
  -- create two valid-looking next states from the same previous state.
  perform 1
  from public.veinvite_archive_manifests m
  where m.id = new.manifest_id
  for update;

  if not found then
    raise exception 'archive manifest % does not exist', new.manifest_id;
  end if;

  -- Verification time is server-derived so callers cannot backdate or
  -- future-date lifecycle events to bypass stale-archive detection.
  new.occurred_at := clock_timestamp();

  select e.status
    into v_previous_status
  from public.veinvite_archive_manifest_events e
  where e.manifest_id = new.manifest_id
  order by e.occurred_at desc, e.id desc
  limit 1;

  if v_previous_status is null then
    if new.status <> 'PREPARED' then
      raise exception 'archive manifest lifecycle must start with PREPARED';
    end if;
    return new;
  end if;

  if v_previous_status = 'PREPARED' and new.status not in ('UPLOADED','FAILED','REVOKED') then
    raise exception 'invalid archive manifest transition: PREPARED -> %', new.status;
  elsif v_previous_status = 'UPLOADED' and new.status not in ('VERIFIED','FAILED','REVOKED') then
    raise exception 'invalid archive manifest transition: UPLOADED -> %', new.status;
  elsif v_previous_status = 'VERIFIED' and new.status <> 'REVOKED' then
    raise exception 'invalid archive manifest transition: VERIFIED -> %', new.status;
  elsif v_previous_status in ('FAILED','REVOKED') then
    raise exception 'archive manifest status % is terminal; create a new manifest', v_previous_status;
  end if;

  if new.status = 'VERIFIED'
     and not (new.details @> '{"artifactChecksumVerified":true,"sourceRowCountVerified":true}'::jsonb) then
    raise exception 'VERIFIED archive event requires checksum and source-row-count verification flags';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_archive_manifest_event_transition() from public, anon, authenticated;
grant execute on function public.enforce_archive_manifest_event_transition() to postgres, service_role;

drop trigger if exists veinvite_archive_manifest_events_transition_guard on public.veinvite_archive_manifest_events;
create trigger veinvite_archive_manifest_events_transition_guard
before insert on public.veinvite_archive_manifest_events
for each row execute function public.enforce_archive_manifest_event_transition();

create or replace function public.is_analytics_date_verified_archived(
  p_dataset_key text,
  p_usage_date date
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_manifest record;
  v_current_count bigint;
  v_latest_source_change timestamptz;
begin
  for v_manifest in
    select
      m.id,
      m.dataset_key,
      m.period_start,
      m.period_end,
      m.source_row_count,
      latest.occurred_at as verified_at
    from public.veinvite_archive_manifests m
    join lateral (
      select e.status, e.details, e.occurred_at
      from public.veinvite_archive_manifest_events e
      where e.manifest_id = m.id
      order by e.occurred_at desc, e.id desc
      limit 1
    ) latest on true
    where m.dataset_key = p_dataset_key
      and p_usage_date between m.period_start and m.period_end
      and latest.status = 'VERIFIED'
      and latest.details @> '{"artifactChecksumVerified":true,"sourceRowCountVerified":true}'::jsonb
    order by latest.occurred_at desc, m.id desc
  loop
    if p_dataset_key = 'app_product_events' then
      select count(*), max(e.received_at)
        into v_current_count, v_latest_source_change
      from public.app_product_events e
      where e.usage_date between v_manifest.period_start and v_manifest.period_end;
    elsif p_dataset_key = 'app_usage_sessions' then
      select count(*), max(s.updated_at)
        into v_current_count, v_latest_source_change
      from public.app_usage_sessions s
      where (s.started_at at time zone 'Asia/Seoul')::date
            between v_manifest.period_start and v_manifest.period_end;
    else
      return false;
    end if;

    if v_current_count = v_manifest.source_row_count
       and (v_latest_source_change is null or v_latest_source_change <= v_manifest.verified_at) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

revoke all on function public.is_analytics_date_verified_archived(text,date) from public, anon, authenticated;
grant execute on function public.is_analytics_date_verified_archived(text,date) to postgres, service_role;

create or replace function public.compact_app_product_analytics(p_retention_days integer default null)
returns table(compacted_days integer, events_deleted bigint)
language plpgsql
set search_path = public
as $$
declare
  v_policy_days integer;
  v_retention_days integer;
  v_cutoff date;
  v_day date;
  v_days integer := 0;
  v_events bigint := 0;
  v_deleted bigint := 0;
  v_unarchived date;
begin
  select p.hot_retention_days
    into v_policy_days
  from public.veinvite_retention_policy_versions p
  where p.dataset_key = 'app_product_events'
    and p.effective_from <= clock_timestamp()
  order by p.effective_from desc, p.created_at desc
  limit 1;

  if v_policy_days is null then
    raise exception 'product analytics cleanup blocked: active retention policy is missing';
  end if;

  v_retention_days := coalesce(p_retention_days, v_policy_days);
  if v_retention_days < v_policy_days or v_retention_days > 3650 then
    raise exception 'product analytics retention days must be between active policy minimum % and 3650', v_policy_days;
  end if;

  -- Destructive cleanup is rare. Hold a short fail-closed table lock so a
  -- concurrent late event cannot appear between verification and DELETE. If
  -- ingestion is busy, cleanup aborts instead of blocking the app for long.
  perform set_config('lock_timeout', '5s', true);
  lock table public.app_product_events in share row exclusive mode;

  v_cutoff := (clock_timestamp() at time zone 'Asia/Seoul')::date - v_retention_days;

  select min(q.usage_date)
    into v_unarchived
  from (
    select distinct e.usage_date
    from public.app_product_events e
    where e.usage_date <= v_cutoff
  ) q
  where not public.is_analytics_date_verified_archived('app_product_events', q.usage_date);

  if v_unarchived is not null then
    raise exception 'raw product analytics cleanup blocked: % does not have a current VERIFIED archive manifest', v_unarchived;
  end if;

  for v_day in
    select distinct e.usage_date
    from public.app_product_events e
    where e.usage_date <= v_cutoff
    order by 1
  loop
    if not public.is_analytics_date_verified_archived('app_product_events', v_day) then
      raise exception 'raw product analytics cleanup blocked at delete time: % archive is stale or unverified', v_day;
    end if;

    perform public.finalize_app_product_analytics_day(v_day);
    if exists(
      select 1 from public.app_usage_sessions s
      where (s.started_at at time zone 'Asia/Seoul')::date = v_day
    ) then
      perform public.finalize_veinvite_daily_funnel_day(v_day);
    end if;

    delete from public.app_product_events where usage_date = v_day;
    get diagnostics v_deleted = row_count;
    v_events := v_events + v_deleted;
    v_days := v_days + 1;
  end loop;

  return query select v_days, v_events;
end;
$$;

revoke all on function public.compact_app_product_analytics(integer) from public, anon, authenticated;
grant execute on function public.compact_app_product_analytics(integer) to postgres, service_role;

create or replace function public.compact_app_usage_analytics(p_retention_days integer default null)
returns table(compacted_days integer, sessions_deleted bigint, visitors_deleted bigint)
language plpgsql
set search_path = public
as $$
declare
  v_policy_days integer;
  v_retention_days integer;
  v_cutoff date;
  v_day date;
  v_days integer := 0;
  v_sessions bigint := 0;
  v_visitors bigint := 0;
  v_deleted bigint := 0;
  v_unarchived date;
begin
  select p.hot_retention_days
    into v_policy_days
  from public.veinvite_retention_policy_versions p
  where p.dataset_key = 'app_usage_sessions'
    and p.effective_from <= clock_timestamp()
  order by p.effective_from desc, p.created_at desc
  limit 1;

  if v_policy_days is null then
    raise exception 'usage analytics cleanup blocked: active retention policy is missing';
  end if;

  v_retention_days := coalesce(p_retention_days, v_policy_days);
  if v_retention_days < v_policy_days or v_retention_days > 3650 then
    raise exception 'analytics retention days must be between active policy minimum % and 3650', v_policy_days;
  end if;

  perform set_config('lock_timeout', '5s', true);
  lock table public.app_usage_sessions in share row exclusive mode;

  v_cutoff := (clock_timestamp() at time zone 'Asia/Seoul')::date - v_retention_days;

  select min(q.usage_date)
    into v_unarchived
  from (
    select distinct (s.started_at at time zone 'Asia/Seoul')::date as usage_date
    from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date <= v_cutoff
  ) q
  where not public.is_analytics_date_verified_archived('app_usage_sessions', q.usage_date);

  if v_unarchived is not null then
    raise exception 'raw usage cleanup blocked: % does not have a current VERIFIED archive manifest', v_unarchived;
  end if;

  for v_day in
    select distinct (s.started_at at time zone 'Asia/Seoul')::date
    from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date <= v_cutoff
    order by 1
  loop
    if not public.is_analytics_date_verified_archived('app_usage_sessions', v_day) then
      raise exception 'raw usage cleanup blocked at delete time: % archive is stale or unverified', v_day;
    end if;

    perform public.finalize_app_usage_analytics_day(v_day);
    perform public.finalize_veinvite_daily_funnel_day(v_day);

    delete from public.app_usage_sessions s
    where (s.started_at at time zone 'Asia/Seoul')::date = v_day;
    get diagnostics v_deleted = row_count;
    v_sessions := v_sessions + v_deleted;

    delete from public.operator_fast_usage_visitors where usage_date = v_day;
    v_days := v_days + 1;
  end loop;

  delete from public.app_usage_visitors v
  where not exists(select 1 from public.app_usage_sessions s where s.visitor_key = v.visitor_key);
  get diagnostics v_visitors = row_count;

  delete from public.app_usage_excluded_visitors x
  where not exists(select 1 from public.app_usage_sessions s where s.visitor_key = x.visitor_key);

  return query select v_days, v_sessions, v_visitors;
end;
$$;

revoke all on function public.compact_app_usage_analytics(integer) from public, anon, authenticated;
grant execute on function public.compact_app_usage_analytics(integer) to postgres, service_role;

commit;
