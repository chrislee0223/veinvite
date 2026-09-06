alter table public.veinvite_archive_manifests add constraint veinvite_archive_analytics_source_filter_check check (dataset_key not in ('app_usage_sessions','app_product_events') or metadata @> '{"sourceFilter":"exclude_analytics_excluded_visitors_v1"}'::jsonb) not valid;
alter table public.veinvite_archive_manifests validate constraint veinvite_archive_analytics_source_filter_check;
create or replace function public.is_analytics_date_verified_archived(p_dataset_key text,p_usage_date date)
returns boolean language plpgsql stable set search_path=public as $$
declare v_manifest record; v_current_count bigint; v_latest_source_change timestamptz;
begin
  for v_manifest in
    select m.id,m.dataset_key,m.period_start,m.period_end,m.source_row_count,latest.occurred_at as verified_at
    from public.veinvite_archive_manifests m
    join lateral(select e.status,e.details,e.occurred_at from public.veinvite_archive_manifest_events e where e.manifest_id=m.id order by e.occurred_at desc,e.id desc limit 1) latest on true
    where m.dataset_key=p_dataset_key and p_usage_date between m.period_start and m.period_end
      and m.metadata @> '{"sourceFilter":"exclude_analytics_excluded_visitors_v1"}'::jsonb
      and latest.status='VERIFIED'
      and latest.details @> '{"artifactChecksumVerified":true,"sourceRowCountVerified":true}'::jsonb
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
    else return false;
    end if;
    if v_current_count=v_manifest.source_row_count and (v_latest_source_change is null or v_latest_source_change<=v_manifest.verified_at) then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function public.is_analytics_date_verified_archived(text,date) from public,anon,authenticated;
grant execute on function public.is_analytics_date_verified_archived(text,date) to postgres,service_role;