begin;

-- Keep immutable referral ledger gaps visible without misreporting rows that are
-- already resolved by reviewed LIVE or LEGACY evidence as an operational backlog.
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
  (select resolved_from_evidence from referral_quality) as referral_relationship_resolved_from_evidence;

comment on view public.operator_long_term_data_health is
  'Long-term analytics and referral data health. referral_relationship_quality_backlog counts only relationships still unresolved after verified evidence; raw_quality_gaps preserves visibility into immutable ledger fields that were originally missing.';

-- A country-at-activation fact must belong to the same invitation that created
-- the canonical referral relationship. The separate FKs alone cannot enforce
-- this relational pair invariant.
create or replace function public.validate_referral_activation_country_fact_integrity()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
declare
  v_source_invitation_id uuid;
  v_relationship_effective_at timestamptz;
begin
  select r.source_invitation_id, r.relationship_effective_at
    into v_source_invitation_id, v_relationship_effective_at
  from public.referral_relationships r
  where r.id = new.relationship_id;

  if not found then
    raise exception 'referral relationship % does not exist', new.relationship_id;
  end if;

  if v_source_invitation_id is distinct from new.source_invitation_id then
    raise exception 'country fact invitation does not match referral relationship source invitation';
  end if;

  if (new.country_source = 'UNKNOWN') <> (new.country_code = 'UNKNOWN') then
    raise exception 'UNKNOWN country source and UNKNOWN country code must be used together';
  end if;

  if new.observed_at < v_relationship_effective_at then
    raise exception 'country observation cannot predate the referral relationship';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_referral_activation_country_fact_integrity()
  from public, anon, authenticated;
grant execute on function public.validate_referral_activation_country_fact_integrity()
  to postgres, service_role;

drop trigger if exists referral_activation_country_facts_integrity_guard
  on public.referral_activation_country_facts;
create trigger referral_activation_country_facts_integrity_guard
before insert on public.referral_activation_country_facts
for each row execute function public.validate_referral_activation_country_fact_integrity();

alter table public.referral_activation_country_facts
  add constraint referral_activation_country_facts_unknown_consistency_check
  check ((country_source = 'UNKNOWN') = (country_code = 'UNKNOWN')) not valid;

alter table public.referral_activation_country_facts
  validate constraint referral_activation_country_facts_unknown_consistency_check;

commit;
