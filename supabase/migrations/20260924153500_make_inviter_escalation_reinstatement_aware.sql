begin;

-- Keep the incident ledger immutable for audit, but count only incidents whose
-- underlying confirmed wallet restriction is still ACTIVE. If an operator
-- later reinstates a wallet, the inviter posture recovers automatically
-- without deleting or rewriting historical evidence.
create or replace view public.operator_sybil_v2_inviter_postures
with (security_invoker = true)
as
with recent as (
  select i.*
  from public.sybil_v2_inviter_incidents i
  join public.sybil_v2_wallet_restrictions r
    on r.id = i.restriction_id
   and r.status = 'ACTIVE'
  where i.recorded_at >= clock_timestamp() - interval '90 days'
),
aggregated as (
  select
    network,
    inviter_wallet,
    count(*)::bigint as incident_count_90d,
    count(*) filter (
      where jsonb_array_length(direct_link_families) >= 2
    )::bigint as strong_direct_link_incident_count_90d,
    max(recorded_at) as latest_incident_at,
    (array_agg(invite_code order by recorded_at desc, invite_code desc))[1]
      as latest_invite_code
  from recent
  group by network, inviter_wallet
)
select
  a.network,
  a.inviter_wallet,
  a.incident_count_90d,
  a.strong_direct_link_incident_count_90d,
  case
    when a.strong_direct_link_incident_count_90d > 0
      or a.incident_count_90d >= 3 then 'HOLD'
    when a.incident_count_90d = 2 then 'WATCH'
    else 'RECORDED'
  end::text as posture,
  case
    when a.strong_direct_link_incident_count_90d > 0 then
      jsonb_build_array(
        'INVITER_STRONG_DIRECT_LINK',
        'CONFIRMED_INVITEE_BLACKLIST'
      )
    when a.incident_count_90d >= 3 then
      jsonb_build_array(
        'INVITER_REPEAT_BLACKLIST_3_IN_90D',
        'CONFIRMED_INVITEE_BLACKLIST'
      )
    when a.incident_count_90d = 2 then
      jsonb_build_array(
        'INVITER_REPEAT_BLACKLIST_2_IN_90D',
        'CONFIRMED_INVITEE_BLACKLIST'
      )
    else
      jsonb_build_array('CONFIRMED_INVITEE_BLACKLIST')
  end as reason_codes,
  jsonb_build_object(
    'windowDays', 90,
    'incidentCount90d', a.incident_count_90d,
    'strongDirectLinkIncidentCount90d',
      a.strong_direct_link_incident_count_90d,
    'activeRestrictionsOnly', true,
    'policy',
      jsonb_build_object(
        'firstIncident', 'RECORDED',
        'secondIncident', 'WATCH',
        'thirdIncident', 'HOLD',
        'strongDirectLinkIndependentFamilies', 2,
        'reinstatedIncidentsCount', false
      )
  ) as evidence_summary,
  a.latest_invite_code,
  a.latest_incident_at
from aggregated a;

revoke all on public.operator_sybil_v2_inviter_postures
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_inviter_postures to service_role;

comment on view public.operator_sybil_v2_inviter_postures is
  'Service-only rolling 90-day inviter escalation posture. Only incidents backed by ACTIVE confirmed restrictions count. REINSTATED restrictions remain in the immutable incident ledger but stop contributing immediately. 1 active incident = RECORDED, 2 = WATCH, 3 = HOLD; a single incident can HOLD only with at least two independent direct-link evidence families.';

commit;
