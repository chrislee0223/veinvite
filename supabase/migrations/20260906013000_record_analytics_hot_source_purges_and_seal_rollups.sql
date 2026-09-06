begin;

create table if not exists public.veinvite_analytics_hot_source_purge_ledger (
  id bigint generated always as identity primary key,
  dataset_key text not null check (dataset_key in ('app_usage_sessions','app_product_events')),
  usage_date date not null,
  manifest_id bigint not null references public.veinvite_archive_manifests(id) on delete restrict,
  manifest_event_id bigint not null unique references public.veinvite_archive_manifest_events(id) on delete restrict,
  archived_row_count bigint not null check (archived_row_count >= 0),
  physical_rows_deleted bigint not null check (physical_rows_deleted >= archived_row_count),
  purged_at timestamptz not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  unique(dataset_key, usage_date)
);

alter table public.veinvite_analytics_hot_source_purge_ledger enable row level security;
revoke all on table public.veinvite_analytics_hot_source_purge_ledger from public, anon, authenticated;
revoke insert, update, delete, truncate on table public.veinvite_analytics_hot_source_purge_ledger from service_role;
grant select on table public.veinvite_analytics_hot_source_purge_ledger to service_role;
revoke all on sequence public.veinvite_analytics_hot_source_purge_ledger_id_seq from public, anon, authenticated, service_role;

drop trigger if exists veinvite_analytics_hot_source_purge_ledger_append_only
  on public.veinvite_analytics_hot_source_purge_ledger;
create trigger veinvite_analytics_hot_source_purge_ledger_append_only
before update or delete on public.veinvite_analytics_hot_source_purge_ledger
for each row execute function public.prevent_long_term_history_mutation();

create or replace function public.capture_analytics_hot_source_purge_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_manifest record;
  v_archived_row_count bigint;
  v_physical_rows_deleted bigint;
begin
  if new.status <> 'HOT_SOURCE_PURGED' then
    return new;
  end if;

  select m.dataset_key, m.period_start, m.period_end, m.source_row_count
    into v_manifest
  from public.veinvite_archive_manifests m
  where m.id = new.manifest_id;

  if not found then
    raise exception 'archive manifest % does not exist', new.manifest_id;
  end if;

  if v_manifest.dataset_key not in ('app_usage_sessions','app_product_events')
     or v_manifest.period_start <> v_manifest.period_end then
    raise exception 'HOT_SOURCE_PURGED ledger requires one-day raw analytics manifest';
  end if;

  if not (new.details @> '{"sourceRowsPurged":true}'::jsonb)
     or jsonb_typeof(new.details->'archivedRowCount') <> 'number'
     or jsonb_typeof(new.details->'physicalRowsDeleted') <> 'number' then
    raise exception 'HOT_SOURCE_PURGED ledger event is missing required purge evidence';
  end if;

  v_archived_row_count := (new.details->>'archivedRowCount')::bigint;
  v_physical_rows_deleted := (new.details->>'physicalRowsDeleted')::bigint;

  if v_archived_row_count <> v_manifest.source_row_count
     or v_physical_rows_deleted < v_archived_row_count then
    raise exception 'HOT_SOURCE_PURGED ledger counts do not match manifest evidence';
  end if;

  insert into public.veinvite_analytics_hot_source_purge_ledger(
    dataset_key,
    usage_date,
    manifest_id,
    manifest_event_id,
    archived_row_count,
    physical_rows_deleted,
    purged_at,
    details
  ) values (
    v_manifest.dataset_key,
    v_manifest.period_start,
    new.manifest_id,
    new.id,
    v_archived_row_count,
    v_physical_rows_deleted,
    new.occurred_at,
    jsonb_build_object(
      'sourceRowsPurged', true,
      'archiveLifecycleStatus', new.status
    )
  );

  return new;
end;
$$;

revoke all on function public.capture_analytics_hot_source_purge_ledger()
  from public, anon, authenticated;
grant execute on function public.capture_analytics_hot_source_purge_ledger()
  to postgres, service_role;

drop trigger if exists veinvite_archive_manifest_events_capture_hot_source_purge
  on public.veinvite_archive_manifest_events;
create trigger veinvite_archive_manifest_events_capture_hot_source_purge
after insert on public.veinvite_archive_manifest_events
for each row execute function public.capture_analytics_hot_source_purge_ledger();

create or replace function public.prevent_sealed_analytics_rollup_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
declare
  v_dataset_key text;
  v_old_date date;
  v_new_date date;
begin
  v_dataset_key := case tg_table_name
    when 'app_usage_daily_rollups' then 'app_usage_sessions'
    when 'app_usage_daily_dimension_rollups' then 'app_usage_sessions'
    when 'app_usage_daily_view_counts' then 'app_usage_sessions'
    when 'app_product_event_daily_rollups' then 'app_product_events'
    when 'app_product_event_daily_dimension_rollups' then 'app_product_events'
    when 'veinvite_daily_funnel_rollups' then 'app_usage_sessions'
    else null
  end;

  if v_dataset_key is null then
    raise exception 'unsupported analytics rollup table %', tg_table_name;
  end if;

  if tg_op in ('UPDATE','DELETE') then
    v_old_date := old.usage_date;
    if exists (
      select 1
      from public.veinvite_analytics_hot_source_purge_ledger p
      where p.dataset_key=v_dataset_key and p.usage_date=v_old_date
    ) then
      raise exception 'analytics rollup date % is sealed after % hot-source purge', v_old_date, v_dataset_key;
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    v_new_date := new.usage_date;
    if exists (
      select 1
      from public.veinvite_analytics_hot_source_purge_ledger p
      where p.dataset_key=v_dataset_key and p.usage_date=v_new_date
    ) then
      raise exception 'analytics rollup date % is sealed after % hot-source purge', v_new_date, v_dataset_key;
    end if;
  end if;

  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_sealed_analytics_rollup_mutation()
  from public, anon, authenticated;
grant execute on function public.prevent_sealed_analytics_rollup_mutation()
  to postgres, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'app_usage_daily_rollups',
    'app_usage_daily_dimension_rollups',
    'app_usage_daily_view_counts',
    'app_product_event_daily_rollups',
    'app_product_event_daily_dimension_rollups',
    'veinvite_daily_funnel_rollups'
  ] loop
    execute format('drop trigger if exists analytics_rollup_seal_guard on public.%I', v_table);
    execute format(
      'create trigger analytics_rollup_seal_guard before insert or update or delete on public.%I for each row execute function public.prevent_sealed_analytics_rollup_mutation()',
      v_table
    );
  end loop;
end;
$$;

create or replace view public.operator_long_term_data_health as
with retention as (
  select distinct on (p.dataset_key)
    p.dataset_key,
    p.hot_retention_days,
    p.archive_required,
    p.delete_requires_verified_archive,
    p.policy_version
  from public.veinvite_retention_policy_versions p
  where p.effective_from <= clock_timestamp()
  order by p.dataset_key, p.effective_from desc, p.created_at desc
), limits as (
  select
    coalesce((select hot_retention_days from retention where dataset_key='app_usage_sessions'),365) as usage_days,
    coalesce((select hot_retention_days from retention where dataset_key='app_product_events'),365) as product_days
), usage_dates as (
  select distinct (s.started_at at time zone 'Asia/Seoul')::date as usage_date
  from public.app_usage_sessions s
), product_dates as (
  select distinct e.usage_date
  from public.app_product_events e
), referral_quality as (
  select
    count(*) filter (
      where q.resolved_network is null or q.resolved_entry_class is null
    )::bigint as unresolved_backlog,
    count(*) filter (
      where r.network is null or r.entry_class_at_activation is null
    )::bigint as raw_quality_gaps,
    count(*) filter (
      where (r.network is null or r.entry_class_at_activation is null)
        and q.resolved_network is not null
        and q.resolved_entry_class is not null
    )::bigint as resolved_from_evidence
  from public.referral_relationships r
  join public.qualified_referral_relationships q on q.id=r.id
)
select
  clock_timestamp() as generated_at,
  (clock_timestamp() at time zone 'Asia/Seoul')::date as seoul_date,
  (select min(usage_date) from usage_dates) as oldest_raw_usage_date,
  (select min(usage_date) from product_dates) as oldest_raw_product_date,
  (select count(*) from public.app_usage_sessions s, limits l
    where (s.started_at at time zone 'Asia/Seoul')::date <= ((clock_timestamp() at time zone 'Asia/Seoul')::date - l.usage_days)
  ) as raw_usage_rows_past_hot_retention,
  (select count(*) from public.app_product_events e, limits l
    where e.usage_date <= ((clock_timestamp() at time zone 'Asia/Seoul')::date - l.product_days)
  ) as raw_product_rows_past_hot_retention,
  (select count(*) from usage_dates d, limits l
    where d.usage_date <= ((clock_timestamp() at time zone 'Asia/Seoul')::date - l.usage_days)
      and not public.is_analytics_date_verified_archived('app_usage_sessions', d.usage_date)
  ) as overdue_usage_days_without_verified_archive,
  (select count(*) from product_dates d, limits l
    where d.usage_date <= ((clock_timestamp() at time zone 'Asia/Seoul')::date - l.product_days)
      and not public.is_analytics_date_verified_archived('app_product_events', d.usage_date)
  ) as overdue_product_days_without_verified_archive,
  (select unresolved_backlog from referral_quality) as referral_relationship_quality_backlog,
  (select max(r.usage_date) from public.app_usage_daily_rollups r) as latest_usage_rollup_date,
  (select max(r.usage_date) from public.app_product_event_daily_rollups r) as latest_product_rollup_date,
  (select max(r.usage_date) from public.veinvite_daily_funnel_rollups r) as latest_funnel_rollup_date,
  (select count(*)
   from public.veinvite_archive_manifests m
   join lateral (
     select e.status
     from public.veinvite_archive_manifest_events e
     where e.manifest_id=m.id
     order by e.occurred_at desc, e.id desc
     limit 1
   ) latest on true
   where latest.status='FAILED'
  ) as failed_archive_manifests,
  (select raw_quality_gaps from referral_quality) as referral_relationship_raw_quality_gaps,
  (select resolved_from_evidence from referral_quality) as referral_relationship_resolved_from_evidence,
  (select count(*) from public.veinvite_analytics_hot_source_purge_ledger) as purged_analytics_dates,
  (select count(*)
   from public.veinvite_analytics_hot_source_purge_ledger p
   where not public.is_analytics_date_verified_archived(p.dataset_key,p.usage_date)
  ) as purged_analytics_dates_without_valid_archive;

comment on table public.veinvite_analytics_hot_source_purge_ledger is
  'Permanent server-only record that a raw analytics date was physically purged only after verified archive lifecycle evidence. Used to keep purged dates observable and seal their permanent rollups.';

commit;
