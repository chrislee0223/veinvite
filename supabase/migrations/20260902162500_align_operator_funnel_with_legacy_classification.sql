-- Keep the simple operator funnel aligned with the verified historical
-- classification backfill. Legacy rows remain immutable in invitations, but
-- verified NEW/RETURNING participants count as accepted and the one verified
-- ACTIVE_EXISTING legacy participant counts as ineligible for reporting.
--
-- The first ten columns intentionally preserve the existing view names/order so
-- CREATE OR REPLACE remains backward compatible for current operator readers.
-- New source-detail counters are appended after those stable columns.
create or replace view public.operator_invitation_funnel
with (security_invoker = true)
as
with latest_legacy as (
  select distinct on (b.invitation_id)
    b.invitation_id,
    b.entry_class,
    b.outcome,
    b.recorded_at
  from public.legacy_entry_classification_backfill b
  where b.classification_status = 'VERIFIED'
  order by b.invitation_id, b.recorded_at desc, b.id desc
),
classified as (
  select
    i.id,
    i.invite_code,
    i.status,
    i.invitee_wallet,
    i.eligibility_check_id,
    i.ineligibility_check_id,
    e.outcome as eligibility_outcome,
    e.entry_class as modern_entry_class,
    l.outcome as legacy_outcome,
    l.entry_class as legacy_entry_class,
    case
      when i.ineligibility_check_id is not null
        then 'INELIGIBLE_LIVE'
      when i.eligibility_check_id is null
       and l.outcome = 'EXISTING_VEBETTER_USER'
       and l.entry_class = 'ACTIVE_EXISTING'
        then 'INELIGIBLE_LEGACY'
      when i.eligibility_check_id is not null
       and e.outcome = 'ELIGIBLE'
       and e.entry_class in ('NEW', 'RETURNING')
        then 'ACCEPTED_MODERN'
      when i.eligibility_check_id is null
       and i.invitee_wallet is not null
       and l.outcome = 'ELIGIBLE'
       and l.entry_class in ('NEW', 'RETURNING')
        then 'ACCEPTED_LEGACY'
      when i.status = 'PENDING_ACCEPTANCE'
        then 'PENDING_ACCEPTANCE'
      when i.status = 'CANCELLED'
        then 'CANCELLED_BY_INVITER'
      when i.invitee_wallet is not null
       and i.eligibility_check_id is null
        then 'LEGACY_UNCLASSIFIED'
      else 'OTHER'
    end as funnel_bucket
  from public.invitations i
  left join public.eligibility_check_events e
    on e.id = i.eligibility_check_id
  left join latest_legacy l
    on l.invitation_id = i.id
)
select
  now() as generated_at,
  count(*)::bigint as invitations_generated,
  count(*) filter (
    where funnel_bucket = 'PENDING_ACCEPTANCE'
  )::bigint as pending_acceptance,
  count(*) filter (
    where funnel_bucket in ('INELIGIBLE_LIVE', 'INELIGIBLE_LEGACY')
  )::bigint as ineligible_rejections,
  count(*) filter (
    where funnel_bucket in ('ACCEPTED_MODERN', 'ACCEPTED_LEGACY')
  )::bigint as accepted_total,
  count(*) filter (
    where funnel_bucket in ('ACCEPTED_MODERN', 'ACCEPTED_LEGACY')
      and coalesce(modern_entry_class, legacy_entry_class) = 'NEW'
  )::bigint as accepted_new,
  count(*) filter (
    where funnel_bucket in ('ACCEPTED_MODERN', 'ACCEPTED_LEGACY')
      and coalesce(modern_entry_class, legacy_entry_class) = 'RETURNING'
  )::bigint as accepted_returning,
  count(*) filter (
    where funnel_bucket = 'CANCELLED_BY_INVITER'
  )::bigint as cancelled_by_inviter,
  count(*) filter (
    where funnel_bucket = 'LEGACY_UNCLASSIFIED'
  )::bigint as legacy_excluded,
  count(*) filter (
    where funnel_bucket = 'OTHER'
  )::bigint as other_rows,
  count(*) filter (
    where funnel_bucket = 'INELIGIBLE_LIVE'
  )::bigint as ineligible_live_rejections,
  count(*) filter (
    where funnel_bucket = 'INELIGIBLE_LEGACY'
  )::bigint as ineligible_legacy_reclassifications,
  count(*) filter (
    where funnel_bucket = 'ACCEPTED_MODERN'
  )::bigint as accepted_modern,
  count(*) filter (
    where funnel_bucket = 'ACCEPTED_LEGACY'
  )::bigint as accepted_legacy
from classified;

revoke all on public.operator_invitation_funnel from anon, authenticated;
grant select on public.operator_invitation_funnel to service_role;
