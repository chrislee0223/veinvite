begin;
create or replace function public.enforce_archive_manifest_event_transition()
returns trigger language plpgsql set search_path=public as $$
declare v_previous_status text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('veinvite_archive_manifest:' || new.manifest_id::text,0));
  if not exists(select 1 from public.veinvite_archive_manifests m where m.id=new.manifest_id) then raise exception 'archive manifest % does not exist',new.manifest_id; end if;
  new.occurred_at:=clock_timestamp();
  select e.status into v_previous_status from public.veinvite_archive_manifest_events e where e.manifest_id=new.manifest_id order by e.occurred_at desc,e.id desc limit 1;
  if v_previous_status is null then
    if new.status<>'PREPARED' then raise exception 'archive manifest lifecycle must start with PREPARED'; end if;
    return new;
  end if;
  if v_previous_status='PREPARED' and new.status not in ('UPLOADED','FAILED','REVOKED') then raise exception 'invalid archive manifest transition: PREPARED -> %',new.status;
  elsif v_previous_status='UPLOADED' and new.status not in ('VERIFIED','FAILED','REVOKED') then raise exception 'invalid archive manifest transition: UPLOADED -> %',new.status;
  elsif v_previous_status='VERIFIED' and new.status<>'REVOKED' then raise exception 'invalid archive manifest transition: VERIFIED -> %',new.status;
  elsif v_previous_status in ('FAILED','REVOKED') then raise exception 'archive manifest status % is terminal; create a new manifest',v_previous_status;
  end if;
  if new.status='VERIFIED' and not (new.details @> '{"artifactChecksumVerified":true,"sourceRowCountVerified":true}'::jsonb) then raise exception 'VERIFIED archive event requires checksum and source-row-count verification flags'; end if;
  return new;
end;
$$;
revoke all on function public.enforce_archive_manifest_event_transition() from public,anon,authenticated;
grant execute on function public.enforce_archive_manifest_event_transition() to postgres,service_role;
commit;