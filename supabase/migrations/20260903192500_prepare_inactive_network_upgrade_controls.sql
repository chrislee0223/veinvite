create table if not exists public.referral_network_policy_versions (
  policy_version text primary key,
  status text not null check (status in ('DRAFT','READY','ACTIVE','RETIRED')),
  qualification_rule text not null,
  max_children smallint not null default 2 check (max_children = 2),
  branch_strategy text not null,
  placement_strategy text not null,
  tie_breaker text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  notes jsonb not null default '{}'::jsonb check (jsonb_typeof(notes) = 'object')
);

alter table public.referral_network_policy_versions enable row level security;
revoke all on public.referral_network_policy_versions from public, anon, authenticated;
grant select on public.referral_network_policy_versions to service_role;

insert into public.referral_network_policy_versions (
  policy_version,
  status,
  qualification_rule,
  max_children,
  branch_strategy,
  placement_strategy,
  tie_breaker,
  notes
) values (
  'binary_balanced_v1',
  'READY',
  'NETWORK_QUALIFIED_ONLY',
  2,
  'SMALLER_ROOT_BRANCH_FIRST',
  'SHALLOWEST_AVAILABLE_POSITION_FIRST',
  'LEFT_FIRST',
  jsonb_build_object(
    'activation_mode', 'INACTIVE_PREP_ONLY',
    'auto_placement_enabled', false,
    'reward_integration_enabled', false,
    'canvas_integration_enabled', false,
    'purpose', 'Prepared during reward-round stabilization; no live behavior changes'
  )
)
on conflict (policy_version) do nothing;

create or replace view public.network_placement_backlog
with (security_invoker = true)
as
select
  nq.relationship_id,
  nq.sponsor_wallet,
  nq.child_wallet,
  nq.source_invitation_id,
  nq.source_invite_code,
  nq.relationship_effective_at,
  nq.relationship_effective_block,
  nq.network,
  nq.resolved_entry_class,
  nq.network_qualified_at,
  case when rsa.relationship_id is null then 'UNPLACED' else 'PLACED' end as placement_status,
  rsa.placement_parent_wallet,
  rsa.slot as placement_slot,
  rsa.assignment_version,
  rsa.assigned_at
from public.network_qualified_referral_relationships nq
left join public.referral_slot_assignments rsa
  on rsa.relationship_id = nq.relationship_id;

revoke all on public.network_placement_backlog from public, anon, authenticated;
grant select on public.network_placement_backlog to service_role;

create or replace view public.network_upgrade_readiness
with (security_invoker = true)
as
select
  now() as checked_at,
  (select count(*) from public.qualified_referral_relationships) as entry_qualified_relationships,
  (select count(*) from public.network_qualified_referral_relationships) as network_qualified_relationships,
  (select count(*) from public.referral_slot_assignments) as placed_relationships,
  (select count(*) from public.network_placement_backlog where placement_status = 'UNPLACED') as unplaced_network_qualified_relationships,
  (select count(*) from public.referral_network_policy_versions where status = 'ACTIVE') as active_policy_count,
  (select count(*) from public.referral_network_policy_versions where policy_version = 'binary_balanced_v1' and status = 'READY') as prepared_policy_count;

revoke all on public.network_upgrade_readiness from public, anon, authenticated;
grant select on public.network_upgrade_readiness to service_role;
