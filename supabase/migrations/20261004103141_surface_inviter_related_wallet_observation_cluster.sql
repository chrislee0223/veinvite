begin;

create or replace view public.operator_sybil_v2_inviter_related_wallet_clusters
with (security_invoker = true)
as
with incident_inviters as (
  select distinct
    i.network,
    lower(i.inviter_wallet) as inviter_wallet
  from public.sybil_v2_inviter_incidents i
),
inviter_clients as (
  select
    ii.network,
    ii.inviter_wallet,
    o.client_id,
    min(o.first_seen_at) as inviter_first_seen_at,
    max(o.last_seen_at) as inviter_last_seen_at
  from incident_inviters ii
  join public.security_client_wallet_observations o
    on lower(o.wallet_address) = ii.inviter_wallet
  group by ii.network, ii.inviter_wallet, o.client_id
)
select
  ic.network,
  ic.inviter_wallet,
  lower(o.wallet_address) as related_wallet,
  ic.client_id,
  'OBSERVED_ONLY'::text as cluster_status,
  ic.inviter_first_seen_at,
  ic.inviter_last_seen_at,
  o.first_seen_at as related_first_seen_at,
  o.last_seen_at as related_last_seen_at,
  jsonb_build_object(
    'sharedSecurityClient', true,
    'sanctionAuthority', false,
    'requiresIndependentBehavioralCorroboration', true
  ) as evidence_summary
from inviter_clients ic
join public.security_client_wallet_observations o
  on o.client_id = ic.client_id
where lower(o.wallet_address) <> ic.inviter_wallet
  and not public.is_analytics_excluded_wallet(ic.inviter_wallet)
  and not public.is_analytics_excluded_wallet(o.wallet_address);

revoke all on public.operator_sybil_v2_inviter_related_wallet_clusters
from public, anon, authenticated;

grant select on public.operator_sybil_v2_inviter_related_wallet_clusters
to service_role;

comment on view public.operator_sybil_v2_inviter_related_wallet_clusters is
  'Service-only observation cluster for wallets sharing a VeInvite security client with an inviter that has confirmed invitee incidents. Membership is evidence for follow-up only and never creates a restriction by itself.';

commit;
