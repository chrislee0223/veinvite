begin;

-- Keep the immutable/raw referral ledger as the complete historical record,
-- including legacy relationships recovered before VeInvite's current entry
-- classification rules were available. Future graph/network-score consumers
-- must use this qualified projection instead of assuming every raw edge is an
-- eligible VeInvite participant relationship.
create or replace view public.qualified_referral_relationships
with (security_invoker = true)
as
select
  r.id,
  r.parent_wallet,
  r.child_wallet,
  r.source_invitation_id,
  r.source_invite_code,
  r.slot,
  r.source_kind,
  r.entry_class_at_activation,
  r.relationship_time_source,
  r.relationship_block,
  r.relationship_time,
  r.source_snapshot,
  r.created_at,
  r.updated_at,
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
  end as eligibility_source
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
  'Service-role-only qualified projection of the immutable referral ledger. Future network graphs and contribution scoring must use this view so ineligible/uncertain legacy edges remain auditable without becoming active network relationships.';

revoke all on table public.qualified_referral_relationships
  from public, anon, authenticated, service_role;
grant select on table public.qualified_referral_relationships
  to service_role;

-- This legacy operator view predates the current VeInvite mission definition.
-- Keep its public shape stable, but make "completed_referrals" mean a current
-- full VeInvite completion rather than the old status label by itself.
create or replace view public.operator_referral_leaderboard
with (security_invoker = true)
as
select
  i.inviter_wallet as wallet_address,
  count(*)::bigint as invitations_created,
  count(*) filter (
    where i.status = 'COMPLETED'
      and i.ineligibility_check_id is null
      and coalesce(e.outcome, legacy.outcome) = 'ELIGIBLE'
      and coalesce(e.entry_class, legacy.entry_class) in ('NEW', 'RETURNING')
      and i.apps_completed >= 3
      and i.vot3_converted is true
      and i.vote_completed is true
      and i.sybil_status = 'CLEAR'
  )::bigint as completed_referrals,
  count(*) filter (
    where i.reward_status = 'PAID'
  )::bigint as paid_referrals,
  count(*) filter (
    where i.sybil_status in ('REVIEW', 'BLOCKED')
  )::bigint as flagged_referrals,
  min(i.created_at) as first_invite_at,
  max(i.updated_at) as last_activity_at
from public.invitations i
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
group by i.inviter_wallet;

comment on view public.operator_referral_leaderboard is
  'Legacy operator referral summary retained for compatibility. completed_referrals follows the current full VeInvite mission and eligibility definition; paid_referrals remains settlement-state based.';

revoke all on table public.operator_referral_leaderboard
  from public, anon, authenticated, service_role;
grant select on table public.operator_referral_leaderboard
  to service_role;

commit;
