-- Keep stale Security Client evidence only for reviews that are actually
-- driven by Security Client identity evidence. Other review sources should not
-- extend pseudonymous browser/client retention unnecessarily.

begin;

create or replace function public.cleanup_security_client_identity_data(
  p_trigger_source text default 'VERCEL_CRON',
  p_retention_days integer default 365,
  p_batch_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
  v_client_ids uuid[] := array[]::uuid[];
  v_candidate_clients integer := 0;
  v_deferred integer := 0;
  v_deleted_observations integer := 0;
  v_deleted_clients integer := 0;
begin
  if p_trigger_source not in ('VERCEL_CRON','MANUAL_OPERATOR','SYSTEM_TEST') then
    raise exception 'unsupported security client retention trigger source';
  end if;
  if p_retention_days is null or p_retention_days < 30 or p_retention_days > 3650 then
    raise exception 'security client retention days must be between 30 and 3650';
  end if;
  if p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 10000 then
    raise exception 'security client retention batch limit must be between 1 and 10000';
  end if;

  v_cutoff := v_now - make_interval(days => p_retention_days);
  perform pg_advisory_xact_lock(hashtextextended('veinvite_security_client_retention_v1', 0));

  select count(distinct c.id)::integer
  into v_deferred
  from public.security_clients c
  where c.created_at < v_cutoff
    and exists (
      select 1
      from public.security_client_wallet_observations o
      join public.invitations i
        on lower(btrim(i.invitee_wallet)) = o.wallet_address
      where o.client_id = c.id
        and i.status = 'UNDER_REVIEW'
        and i.sybil_status = 'REVIEW'
        and (
          i.sybil_source = 'SECURITY_CLIENT'
          or i.identity_link_status = 'REVIEW'
        )
    );

  select coalesce(array_agg(s.id), array[]::uuid[])
  into v_client_ids
  from (
    select c.id
    from public.security_clients c
    where c.created_at < v_cutoff
      and not exists (
        select 1
        from public.security_client_wallet_observations o
        join public.invitations i
          on lower(btrim(i.invitee_wallet)) = o.wallet_address
        where o.client_id = c.id
          and i.status = 'UNDER_REVIEW'
          and i.sybil_status = 'REVIEW'
          and (
            i.sybil_source = 'SECURITY_CLIENT'
            or i.identity_link_status = 'REVIEW'
          )
      )
    order by c.created_at, c.id
    limit p_batch_limit
    for update of c skip locked
  ) s;

  v_candidate_clients := coalesce(cardinality(v_client_ids), 0);

  if v_candidate_clients > 0 then
    delete from public.security_client_wallet_observations o
    where o.client_id = any(v_client_ids);
    get diagnostics v_deleted_observations = row_count;

    delete from public.security_clients c
    where c.id = any(v_client_ids);
    get diagnostics v_deleted_clients = row_count;
  end if;

  insert into public.security_client_retention_runs(
    policy_version,
    retention_days,
    batch_limit,
    cutoff_at,
    candidate_clients,
    deferred_open_review_clients,
    deleted_observations,
    deleted_clients,
    trigger_source,
    ran_at
  ) values (
    'security_client_retention_v1',
    p_retention_days,
    p_batch_limit,
    v_cutoff,
    v_candidate_clients,
    v_deferred,
    v_deleted_observations,
    v_deleted_clients,
    p_trigger_source,
    v_now
  );

  return jsonb_build_object(
    'policyVersion', 'security_client_retention_v1',
    'retentionDays', p_retention_days,
    'retentionBasis', 'CLIENT_CREATED_AT',
    'batchLimit', p_batch_limit,
    'cutoffAt', v_cutoff,
    'candidateClients', v_candidate_clients,
    'deferredOpenReviewClients', v_deferred,
    'deletedObservations', v_deleted_observations,
    'deletedClients', v_deleted_clients,
    'ranAt', v_now
  );
end;
$$;

revoke all on function public.cleanup_security_client_identity_data(
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.cleanup_security_client_identity_data(
  text,
  integer,
  integer
) to service_role;

commit;
