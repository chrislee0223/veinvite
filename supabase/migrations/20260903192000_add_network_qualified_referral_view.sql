create or replace view public.network_qualified_referral_relationships
with (security_invoker = true)
as
select
  q.id as relationship_id,
  lower(q.parent_wallet) as sponsor_wallet,
  lower(q.child_wallet) as child_wallet,
  q.source_invitation_id,
  q.source_invite_code,
  q.relationship_effective_at,
  q.relationship_effective_block,
  q.resolved_network as network,
  q.rule_version as referral_rule_version,
  q.source_kind,
  q.slot as invitation_slot,
  q.resolved_entry_class,
  q.resolved_outcome,
  q.eligibility_source,
  i.status as invitation_status,
  i.reward_status,
  i.reward_eligible_at,
  i.reward_paid_at,
  coalesce(i.reward_eligible_at, i.reward_paid_at) as network_qualified_at,
  'network_qualified_v1'::text as network_qualification_version
from public.qualified_referral_relationships q
join public.invitations i
  on i.id = q.source_invitation_id
where i.status = 'COMPLETED'
  and i.reward_status in ('ELIGIBLE', 'PAID')
  and coalesce(i.reward_eligible_at, i.reward_paid_at) is not null;

comment on view public.network_qualified_referral_relationships is
  'Referral relationships eligible for permanent binary-network placement. Entry eligibility alone is insufficient; the VeInvite mission must be fully completed and reward-verified.';

revoke all on public.network_qualified_referral_relationships from anon, authenticated;
grant select on public.network_qualified_referral_relationships to service_role;
