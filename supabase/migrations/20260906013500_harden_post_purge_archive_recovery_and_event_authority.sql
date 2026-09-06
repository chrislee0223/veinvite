begin;

-- The destructive cleanup functions are tightly parameter-bounded and already
-- service-only. Run them as their postgres owner so HOT_SOURCE_PURGED can be
-- recorded without granting service_role direct INSERT on archive lifecycle
-- history.
alter function public.compact_app_product_analytics(integer) security definer;
alter function public.compact_app_product_analytics(integer) set search_path to pg_catalog, public;
alter function public.compact_app_usage_analytics(integer) security definer;
alter function public.compact_app_usage_analytics(integer) set search_path to pg_catalog, public;

-- Archive workers may append normal lifecycle events through this narrow RPC.
-- HOT_SOURCE_PURGED is deliberately excluded: only a successful compaction
-- transaction may create that state.
create or replace function public.append_veinvite_archive_manifest_event(
  p_manifest_id bigint,
  p_status text,
  p_details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_event_id bigint;
begin
  if p_status not in ('PREPARED','UPLOADED','VERIFIED','FAILED','REVOKED') then
    raise exception 'archive lifecycle status % is not allowed through the public worker RPC', p_status;
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'archive lifecycle details must be a JSON object';
  end if;

  insert into public.veinvite_archive_manifest_events(manifest_id,status,details)
  values(p_manifest_id,p_status,p_details)
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.append_veinvite_archive_manifest_event(bigint,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.append_veinvite_archive_manifest_event(bigint,text,jsonb)
  to postgres, service_role;

revoke insert on table public.veinvite_archive_manifest_events from service_role;

-- Once a date has been physically purged, old-date raw rows must not silently
-- reappear. Product dates are server-derived and usage sessions are not expected
-- to remain active for 365+ days, so a reintroduction indicates a bug or manual
-- corruption and must fail closed.
create or replace function public.prevent_reintroduction_into_purged_analytics_date()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
declare
  v_dataset_key text;
  v_usage_date date;
begin
  if tg_table_name = 'app_product_events' then
    v_dataset_key := 'app_product_events';
    v_usage_date := new.usage_date;
  elsif tg_table_name = 'app_usage_sessions' then
    v_dataset_key := 'app_usage_sessions';
    v_usage_date := (new.started_at at time zone 'Asia/Seoul')::date;
  else
    raise exception 'unsupported purged analytics raw table %', tg_table_name;
  end if;

  if exists (
    select 1
    from public.veinvite_analytics_hot_source_purge_ledger p
    where p.dataset_key=v_dataset_key
      and p.usage_date=v_usage_date
  ) then
    raise exception 'raw analytics date % is permanently sealed after % hot-source purge',
      v_usage_date, v_dataset_key;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_reintroduction_into_purged_analytics_date()
  from public, anon, authenticated;
grant execute on function public.prevent_reintroduction_into_purged_analytics_date()
  to postgres, service_role;

drop trigger if exists app_product_events_prevent_purged_date_reintroduction
  on public.app_product_events;
create trigger app_product_events_prevent_purged_date_reintroduction
before insert on public.app_product_events
for each row execute function public.prevent_reintroduction_into_purged_analytics_date();

drop trigger if exists app_usage_sessions_prevent_purged_date_reintroduction
  on public.app_usage_sessions;
create trigger app_usage_sessions_prevent_purged_date_reintroduction
before insert or update on public.app_usage_sessions
for each row execute function public.prevent_reintroduction_into_purged_analytics_date();

-- A verified replacement/copy created after the hot source has already been
-- purged can be authoritative when it carries exactly the permanently recorded
-- pre-purge row count. This provides a recovery path after an older archive is
-- revoked without pretending that zero remaining hot rows were the original
-- source count.
create or replace function public.is_analytics_date_verified_archived(
  p_dataset_key text,
  p_usage_date date
)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $$
declare
  v_manifest record;
  v_current_count bigint;
  v_physical_count bigint;
  v_latest_source_change timestamptz;
  v_purged_archived_count bigint;
begin
  if p_dataset_key not in ('app_usage_sessions','app_product_events') then
    return false;
  end if;

  select p.archived_row_count
    into v_purged_archived_count
  from public.veinvite_analytics_hot_source_purge_ledger p
  where p.dataset_key=p_dataset_key
    and p.usage_date=p_usage_date
  limit 1;

  for v_manifest in
    select
      m.id,
      m.period_start,
      m.period_end,
      m.source_row_count,
      latest.status,
      latest.details,
      latest.occurred_at as state_at
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
      and m.metadata @> '{"sourceFilter":"exclude_analytics_excluded_visitors_v1"}'::jsonb
      and latest.status in ('VERIFIED','HOT_SOURCE_PURGED')
    order by latest.occurred_at desc, m.id desc
  loop
    if p_dataset_key = 'app_product_events' then
      select
        count(*) filter (where x.visitor_key is null),
        count(*),
        greatest(max(e.received_at), max(x.excluded_at))
        into v_current_count, v_physical_count, v_latest_source_change
      from public.app_product_events e
      left join public.app_usage_excluded_visitors x
        on x.visitor_key = e.visitor_key
      where e.usage_date between v_manifest.period_start and v_manifest.period_end;
    else
      select
        count(*) filter (where x.visitor_key is null),
        count(*),
        greatest(max(s.updated_at), max(x.excluded_at))
        into v_current_count, v_physical_count, v_latest_source_change
      from public.app_usage_sessions s
      left join public.app_usage_excluded_visitors x
        on x.visitor_key = s.visitor_key
      where (s.started_at at time zone 'Asia/Seoul')::date
            between v_manifest.period_start and v_manifest.period_end;
    end if;

    if v_manifest.status = 'VERIFIED'
       and v_manifest.details @> '{"artifactChecksumVerified":true,"sourceRowCountVerified":true}'::jsonb
       and v_current_count = v_manifest.source_row_count
       and (
         v_latest_source_change is null
         or v_latest_source_change <= v_manifest.state_at
       ) then
      return true;
    end if;

    if v_manifest.status = 'VERIFIED'
       and v_manifest.details @> '{"artifactChecksumVerified":true,"sourceRowCountVerified":true}'::jsonb
       and v_purged_archived_count is not null
       and v_manifest.source_row_count = v_purged_archived_count
       and v_current_count = 0
       and v_physical_count = 0 then
      return true;
    end if;

    if v_manifest.status = 'HOT_SOURCE_PURGED'
       and v_manifest.details @> '{"sourceRowsPurged":true}'::jsonb
       and jsonb_typeof(v_manifest.details->'archivedRowCount') = 'number'
       and (v_manifest.details->>'archivedRowCount')::bigint = v_manifest.source_row_count
       and v_current_count = 0
       and v_physical_count = 0
       and (
         v_latest_source_change is null
         or v_latest_source_change <= v_manifest.state_at
       ) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

revoke all on function public.is_analytics_date_verified_archived(text,date)
  from public, anon, authenticated;
grant execute on function public.is_analytics_date_verified_archived(text,date)
  to postgres, service_role;

commit;
