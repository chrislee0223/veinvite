alter table public.veinvite_archive_manifest_events drop constraint veinvite_archive_manifest_events_status_check;
alter table public.veinvite_archive_manifest_events add constraint veinvite_archive_manifest_events_status_check check(status in ('PREPARED','UPLOADED','VERIFIED','HOT_SOURCE_PURGED','FAILED','REVOKED'));

create or replace function public.enforce_archive_manifest_event_transition()
returns trigger language plpgsql set search_path=public as $$
declare v_previous_status text; v_dataset_key text; v_period_start date; v_period_end date; v_manifest_source_count bigint; v_physical_rows bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('veinvite_archive_manifest:' || new.manifest_id::text,0));
  select m.dataset_key,m.period_start,m.period_end,m.source_row_count into v_dataset_key,v_period_start,v_period_end,v_manifest_source_count from public.veinvite_archive_manifests m where m.id=new.manifest_id;
  if not found then raise exception 'archive manifest % does not exist',new.manifest_id; end if;
  new.occurred_at:=clock_timestamp();
  select e.status into v_previous_status from public.veinvite_archive_manifest_events e where e.manifest_id=new.manifest_id order by e.occurred_at desc,e.id desc limit 1;
  if v_previous_status is null then if new.status<>'PREPARED' then raise exception 'archive manifest lifecycle must start with PREPARED'; end if; return new; end if;
  if v_previous_status='PREPARED' and new.status not in ('UPLOADED','FAILED','REVOKED') then raise exception 'invalid archive manifest transition: PREPARED -> %',new.status;
  elsif v_previous_status='UPLOADED' and new.status not in ('VERIFIED','FAILED','REVOKED') then raise exception 'invalid archive manifest transition: UPLOADED -> %',new.status;
  elsif v_previous_status='VERIFIED' and new.status not in ('HOT_SOURCE_PURGED','REVOKED') then raise exception 'invalid archive manifest transition: VERIFIED -> %',new.status;
  elsif v_previous_status='HOT_SOURCE_PURGED' and new.status<>'REVOKED' then raise exception 'invalid archive manifest transition: HOT_SOURCE_PURGED -> %',new.status;
  elsif v_previous_status in ('FAILED','REVOKED') then raise exception 'archive manifest status % is terminal; create a new manifest',v_previous_status;
  end if;
  if new.status='VERIFIED' and not(new.details @> '{"artifactChecksumVerified":true,"sourceRowCountVerified":true}'::jsonb) then raise exception 'VERIFIED archive event requires checksum and source-row-count verification flags'; end if;
  if new.status='HOT_SOURCE_PURGED' then
    if not(new.details @> '{"sourceRowsPurged":true}'::jsonb) or jsonb_typeof(new.details->'archivedRowCount')<>'number' or jsonb_typeof(new.details->'physicalRowsDeleted')<>'number' then raise exception 'HOT_SOURCE_PURGED requires sourceRowsPurged, archivedRowCount and physicalRowsDeleted'; end if;
    if (new.details->>'archivedRowCount')::bigint<>v_manifest_source_count then raise exception 'HOT_SOURCE_PURGED archivedRowCount must equal manifest source_row_count'; end if;
    if (new.details->>'physicalRowsDeleted')::bigint<v_manifest_source_count then raise exception 'HOT_SOURCE_PURGED physicalRowsDeleted cannot be smaller than archivedRowCount'; end if;
    if v_dataset_key='app_usage_sessions' then select count(*) into v_physical_rows from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date between v_period_start and v_period_end;
    elsif v_dataset_key='app_product_events' then select count(*) into v_physical_rows from public.app_product_events e where e.usage_date between v_period_start and v_period_end;
    else raise exception 'HOT_SOURCE_PURGED is only valid for raw analytics datasets'; end if;
    if v_physical_rows<>0 then raise exception 'HOT_SOURCE_PURGED cannot be recorded while % physical source rows remain',v_physical_rows; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_archive_manifest_event_transition() from public,anon,authenticated;
grant execute on function public.enforce_archive_manifest_event_transition() to postgres,service_role;

create or replace function public.current_verified_analytics_archive_manifest_id(p_dataset_key text,p_usage_date date)
returns bigint language plpgsql stable set search_path=public as $$
declare v_manifest record; v_current_count bigint; v_latest_source_change timestamptz;
begin
  for v_manifest in
    select m.id,m.period_start,m.period_end,m.source_row_count,latest.occurred_at as verified_at
    from public.veinvite_archive_manifests m
    join lateral(select e.status,e.details,e.occurred_at from public.veinvite_archive_manifest_events e where e.manifest_id=m.id order by e.occurred_at desc,e.id desc limit 1) latest on true
    where m.dataset_key=p_dataset_key and p_usage_date between m.period_start and m.period_end
      and m.metadata @> '{"sourceFilter":"exclude_analytics_excluded_visitors_v1"}'::jsonb
      and latest.status='VERIFIED' and latest.details @> '{"artifactChecksumVerified":true,"sourceRowCountVerified":true}'::jsonb
    order by latest.occurred_at desc,m.id desc
  loop
    if p_dataset_key='app_product_events' then
      select count(*) filter(where x.visitor_key is null),greatest(max(e.received_at),max(x.excluded_at)) into v_current_count,v_latest_source_change
      from public.app_product_events e left join public.app_usage_excluded_visitors x on x.visitor_key=e.visitor_key
      where e.usage_date between v_manifest.period_start and v_manifest.period_end;
    elsif p_dataset_key='app_usage_sessions' then
      select count(*) filter(where x.visitor_key is null),greatest(max(s.updated_at),max(x.excluded_at)) into v_current_count,v_latest_source_change
      from public.app_usage_sessions s left join public.app_usage_excluded_visitors x on x.visitor_key=s.visitor_key
      where (s.started_at at time zone 'Asia/Seoul')::date between v_manifest.period_start and v_manifest.period_end;
    else return null;
    end if;
    if v_current_count=v_manifest.source_row_count and (v_latest_source_change is null or v_latest_source_change<=v_manifest.verified_at) then return v_manifest.id; end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.current_verified_analytics_archive_manifest_id(text,date) from public,anon,authenticated;
grant execute on function public.current_verified_analytics_archive_manifest_id(text,date) to postgres,service_role;

create or replace function public.is_analytics_date_verified_archived(p_dataset_key text,p_usage_date date)
returns boolean language plpgsql stable set search_path=public as $$
declare v_manifest record; v_current_count bigint; v_physical_count bigint; v_latest_source_change timestamptz;
begin
  for v_manifest in
    select m.id,m.period_start,m.period_end,m.source_row_count,latest.status,latest.details,latest.occurred_at as state_at
    from public.veinvite_archive_manifests m
    join lateral(select e.status,e.details,e.occurred_at from public.veinvite_archive_manifest_events e where e.manifest_id=m.id order by e.occurred_at desc,e.id desc limit 1) latest on true
    where m.dataset_key=p_dataset_key and p_usage_date between m.period_start and m.period_end
      and m.metadata @> '{"sourceFilter":"exclude_analytics_excluded_visitors_v1"}'::jsonb
      and latest.status in ('VERIFIED','HOT_SOURCE_PURGED')
    order by latest.occurred_at desc,m.id desc
  loop
    if p_dataset_key='app_product_events' then
      select count(*) filter(where x.visitor_key is null),count(*),greatest(max(e.received_at),max(x.excluded_at)) into v_current_count,v_physical_count,v_latest_source_change
      from public.app_product_events e left join public.app_usage_excluded_visitors x on x.visitor_key=e.visitor_key
      where e.usage_date between v_manifest.period_start and v_manifest.period_end;
    elsif p_dataset_key='app_usage_sessions' then
      select count(*) filter(where x.visitor_key is null),count(*),greatest(max(s.updated_at),max(x.excluded_at)) into v_current_count,v_physical_count,v_latest_source_change
      from public.app_usage_sessions s left join public.app_usage_excluded_visitors x on x.visitor_key=s.visitor_key
      where (s.started_at at time zone 'Asia/Seoul')::date between v_manifest.period_start and v_manifest.period_end;
    else return false;
    end if;
    if v_manifest.status='VERIFIED' and v_manifest.details @> '{"artifactChecksumVerified":true,"sourceRowCountVerified":true}'::jsonb and v_current_count=v_manifest.source_row_count and (v_latest_source_change is null or v_latest_source_change<=v_manifest.state_at) then return true; end if;
    if v_manifest.status='HOT_SOURCE_PURGED' and v_manifest.details @> '{"sourceRowsPurged":true}'::jsonb and jsonb_typeof(v_manifest.details->'archivedRowCount')='number' and (v_manifest.details->>'archivedRowCount')::bigint=v_manifest.source_row_count and v_current_count=0 and v_physical_count=0 and (v_latest_source_change is null or v_latest_source_change<=v_manifest.state_at) then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function public.is_analytics_date_verified_archived(text,date) from public,anon,authenticated;
grant execute on function public.is_analytics_date_verified_archived(text,date) to postgres,service_role;

create or replace function public.compact_app_product_analytics(p_retention_days integer default null)
returns table(compacted_days integer,events_deleted bigint)
language plpgsql set search_path=public as $$
declare v_policy_days integer; v_retention_days integer; v_cutoff date; v_day date; v_deleted bigint:=0; v_manifest_id bigint; v_archived_count bigint;
begin
  select p.hot_retention_days into v_policy_days from public.veinvite_retention_policy_versions p where p.dataset_key='app_product_events' and p.effective_from<=clock_timestamp() order by p.effective_from desc,p.created_at desc limit 1;
  if v_policy_days is null then raise exception 'product analytics cleanup blocked: active retention policy is missing'; end if;
  v_retention_days:=coalesce(p_retention_days,v_policy_days);
  if v_retention_days<v_policy_days or v_retention_days>3650 then raise exception 'product analytics retention days must be between active policy minimum % and 3650',v_policy_days; end if;
  perform set_config('lock_timeout','5s',true);
  lock table public.app_usage_sessions in share row exclusive mode;
  lock table public.app_product_events in share row exclusive mode;
  v_cutoff:=(clock_timestamp() at time zone 'Asia/Seoul')::date-v_retention_days;
  select min(e.usage_date) into v_day from public.app_product_events e where e.usage_date<=v_cutoff;
  if v_day is null then return query select 0,0::bigint; return; end if;
  v_manifest_id:=public.current_verified_analytics_archive_manifest_id('app_product_events',v_day);
  if v_manifest_id is null then raise exception 'raw product analytics cleanup blocked: % does not have a current VERIFIED one-day archive manifest',v_day; end if;
  select source_row_count into v_archived_count from public.veinvite_archive_manifests where id=v_manifest_id;
  perform public.finalize_app_product_analytics_day(v_day);
  if exists(select 1 from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=v_day) then perform public.finalize_veinvite_daily_funnel_day(v_day); end if;
  delete from public.app_product_events where usage_date=v_day;
  get diagnostics v_deleted=row_count;
  insert into public.veinvite_archive_manifest_events(manifest_id,status,details) values(v_manifest_id,'HOT_SOURCE_PURGED',jsonb_build_object('sourceRowsPurged',true,'archivedRowCount',v_archived_count,'physicalRowsDeleted',v_deleted));
  return query select 1,v_deleted;
end;
$$;
revoke all on function public.compact_app_product_analytics(integer) from public,anon,authenticated;
grant execute on function public.compact_app_product_analytics(integer) to postgres,service_role;

create or replace function public.compact_app_usage_analytics(p_retention_days integer default null)
returns table(compacted_days integer,sessions_deleted bigint,visitors_deleted bigint)
language plpgsql set search_path=public as $$
declare v_policy_days integer; v_retention_days integer; v_cutoff date; v_day date; v_sessions bigint:=0; v_visitors bigint:=0; v_manifest_id bigint; v_archived_count bigint;
begin
  select p.hot_retention_days into v_policy_days from public.veinvite_retention_policy_versions p where p.dataset_key='app_usage_sessions' and p.effective_from<=clock_timestamp() order by p.effective_from desc,p.created_at desc limit 1;
  if v_policy_days is null then raise exception 'usage analytics cleanup blocked: active retention policy is missing'; end if;
  v_retention_days:=coalesce(p_retention_days,v_policy_days);
  if v_retention_days<v_policy_days or v_retention_days>3650 then raise exception 'analytics retention days must be between active policy minimum % and 3650',v_policy_days; end if;
  perform set_config('lock_timeout','5s',true);
  lock table public.app_usage_sessions in share row exclusive mode;
  lock table public.app_product_events in share row exclusive mode;
  v_cutoff:=(clock_timestamp() at time zone 'Asia/Seoul')::date-v_retention_days;
  select min((s.started_at at time zone 'Asia/Seoul')::date) into v_day from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date<=v_cutoff;
  if v_day is null then return query select 0,0::bigint,0::bigint; return; end if;
  if exists(select 1 from public.app_product_events e where e.usage_date=v_day) then raise exception 'raw usage cleanup blocked: product analytics for % must be compacted first',v_day; end if;
  v_manifest_id:=public.current_verified_analytics_archive_manifest_id('app_usage_sessions',v_day);
  if v_manifest_id is null then raise exception 'raw usage cleanup blocked: % does not have a current VERIFIED one-day archive manifest',v_day; end if;
  select source_row_count into v_archived_count from public.veinvite_archive_manifests where id=v_manifest_id;
  perform public.finalize_app_usage_analytics_day(v_day);
  perform public.finalize_veinvite_daily_funnel_day(v_day);
  delete from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=v_day;
  get diagnostics v_sessions=row_count;
  insert into public.veinvite_archive_manifest_events(manifest_id,status,details) values(v_manifest_id,'HOT_SOURCE_PURGED',jsonb_build_object('sourceRowsPurged',true,'archivedRowCount',v_archived_count,'physicalRowsDeleted',v_sessions));
  delete from public.operator_fast_usage_visitors where usage_date=v_day;
  delete from public.app_usage_visitors v where not exists(select 1 from public.app_usage_sessions s where s.visitor_key=v.visitor_key);
  get diagnostics v_visitors=row_count;
  delete from public.app_usage_excluded_visitors x where not exists(select 1 from public.app_usage_sessions s where s.visitor_key=x.visitor_key);
  return query select 1,v_sessions,v_visitors;
end;
$$;
revoke all on function public.compact_app_usage_analytics(integer) from public,anon,authenticated;
grant execute on function public.compact_app_usage_analytics(integer) to postgres,service_role;