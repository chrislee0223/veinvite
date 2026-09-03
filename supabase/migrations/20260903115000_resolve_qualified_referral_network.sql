begin;

-- Preserve the immutable/raw referral ledger exactly as captured, including
-- legacy rows that predate activation_network/eligibility network capture.
-- Future graph consumers need a deterministic network without rewriting that
-- history, so expose a resolved network and its provenance on the qualified
-- service-role-only projection.
create or replace view public.qualified_referral_relationships
with (security_invoker = true)
as
select
  r.id,
  r.parent_wallet,
  r.child_wallet,
  r.source_invitation_id,
  r.source_invite_code,
  r.relationship_effective_at,
  r.relationship_effective_block,
  r.network,
  r.rule_version,
  r.source_kind,
  r.slot,
  r.entry_class_at_activation,
  r.invitation_created_at,
  r.source_snapshot,
  r.recorded_at,
  r.relationship_time_source,
  coalesce(
    e.entry_class,
    legacy.entry_class,
    r.entry_class_at_activation
  ) as resolved_entry_class,
  coalesce(
    e.outcome,
    legacy.outcome
  ) as resolved_outcome,
  case
    when e.id is not null then 'LIVE'
    when legacy.id is not null then 'LEGACY_BACKFILL'
    else 'LEDGER_SNAPSHOT'
  end as eligibility_source,
  coalesce(
    r.network,
    e.network,
    legacy.network
  ) as resolved_network,
  case
    when r.network is not null then 'LEDGER'
    when e.network is not null then 'LIVE_ELIGIBILITY'
    when legacy.network is not null then 'LEGACY_BACKFILL'
    else 'UNRESOLVED'
  end as resolved_network_source
from public.referral_relationships r
join public.invitations i
  on i.id = r.source_invitation_id
left join public.eligibility_check_events e
  on e.id = i.eligibility_check_id
left join lateral (
  select lb.*
  from public.legacy_entry_classification_backfill lb
  where lb.invitation_id = i.id
    and lb.classification_status = 'VERIFIED'
  order by lb.recorded_at desc, lb.id desc
  limit 1
) legacy on true
where lower(btrim(i.inviter_wallet)) = lower(btrim(r.parent_wallet))
  and i.invitee_wallet is not null
  and lower(btrim(i.invitee_wallet)) = lower(btrim(r.child_wallet))
  and i.invite_code = r.source_invite_code
  and i.ineligibility_check_id is null
  and coalesce(e.outcome, legacy.outcome) = 'ELIGIBLE'
  and coalesce(
    e.entry_class,
    legacy.entry_class,
    r.entry_class_at_activation
  ) in ('NEW', 'RETURNING');

comment on view public.qualified_referral_relationships is
  'Service-role-only qualified projection of the immutable referral ledger. Raw network capture is preserved in network; resolved_network fills only from verified eligibility/backfill evidence for future graph/network-score consumers.';

revoke all on table public.qualified_referral_relationships
  from public, anon, authenticated, service_role;
grant select on table public.qualified_referral_relationships
  to service_role;

commit;
