begin;

create table if not exists public.sybil_v2_inviter_incidents (
  id uuid primary key default gen_random_uuid(),
  network text not null
    check (network in ('mainnet','testnet','testnet-staging')),
  invite_code text not null
    references public.invitations(invite_code) on update cascade on delete restrict,
  inviter_wallet text not null
    check (inviter_wallet ~ '^0x[0-9a-f]{40}$'),
  invitee_wallet text not null
    check (invitee_wallet ~ '^0x[0-9a-f]{40}$'),
  restriction_id uuid not null
    references public.sybil_v2_wallet_restrictions(id) on update cascade on delete restrict,
  direct_link_families jsonb not null default '[]'::jsonb
    check (jsonb_typeof(direct_link_families) = 'array'),
  direct_link_signals jsonb not null default '[]'::jsonb
    check (jsonb_typeof(direct_link_signals) = 'array'),
  reason_codes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reason_codes) = 'array'),
  evidence_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_summary) = 'object'),
  source text not null default 'OPERATOR'
    check (source = 'OPERATOR'),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(network, invite_code)
);

create index if not exists sybil_v2_inviter_incidents_wallet_time_idx
  on public.sybil_v2_inviter_incidents(network, inviter_wallet, recorded_at desc);
create index if not exists sybil_v2_inviter_incidents_restriction_idx
  on public.sybil_v2_inviter_incidents(restriction_id);
create index if not exists sybil_v2_inviter_incidents_invite_idx
  on public.sybil_v2_inviter_incidents(invite_code);

alter table public.sybil_v2_inviter_incidents enable row level security;
revoke all on public.sybil_v2_inviter_incidents from public, anon, authenticated;
grant select, insert on public.sybil_v2_inviter_incidents to service_role;

drop trigger if exists sybil_v2_inviter_incidents_append_only
  on public.sybil_v2_inviter_incidents;
create trigger sybil_v2_inviter_incidents_append_only
before update or delete on public.sybil_v2_inviter_incidents
for each row execute function public.prevent_sybil_v2_append_only_mutation();

comment on table public.sybil_v2_inviter_incidents is
  'Append-only confirmed abuse incidents attributed to an inviter after an invitee is operator-blacklisted. One abusive invitee does not itself restrict the inviter; the rolling 90-day posture view applies graduated escalation.';

create or replace function public.capture_sybil_v2_inviter_incident()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invitation public.invitations%rowtype;
  v_direct_families jsonb := '[]'::jsonb;
  v_direct_signals jsonb := '[]'::jsonb;
  v_direct_family_count integer := 0;
begin
  if new.status <> 'ACTIVE'
     or new.source <> 'OPERATOR'
     or new.related_invite_code is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'ACTIVE' then
    return new;
  end if;

  select *
  into v_invitation
  from public.invitations i
  where i.invite_code = new.related_invite_code
    and i.invitee_wallet is not null
    and lower(i.invitee_wallet) = lower(new.wallet_address);

  if not found or v_invitation.inviter_wallet is null then
    return new;
  end if;

  select
    coalesce(
      jsonb_agg(distinct e.evidence_family)
        filter (where e.evidence_family is not null),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(distinct e.signal_code)
        filter (where e.signal_code is not null),
      '[]'::jsonb
    )
  into v_direct_families, v_direct_signals
  from public.sybil_v2_evidence_records e
  where e.invite_code = new.related_invite_code
    and e.related_wallet = lower(v_invitation.inviter_wallet)
    and e.signal_code in (
      'SECURITY_CLIENT_INVITER_LINK',
      'RECENT_B3TR_FROM_INVITER',
      'RECENT_VET_FROM_INVITER',
      'RECENT_VTHO_FROM_INVITER',
      'HISTORICAL_SINK_REAPPEARS_AS_INVITER'
    );

  v_direct_family_count := jsonb_array_length(v_direct_families);

  insert into public.sybil_v2_inviter_incidents(
    network,
    invite_code,
    inviter_wallet,
    invitee_wallet,
    restriction_id,
    direct_link_families,
    direct_link_signals,
    reason_codes,
    evidence_summary,
    source,
    recorded_at
  ) values (
    new.network,
    new.related_invite_code,
    lower(v_invitation.inviter_wallet),
    lower(v_invitation.invitee_wallet),
    new.id,
    v_direct_families,
    v_direct_signals,
    jsonb_build_array('CONFIRMED_INVITEE_BLACKLIST'),
    jsonb_build_object(
      'restrictionId', new.id,
      'restrictionReasonCodes', new.reason_codes,
      'directLinkFamilyCount', v_direct_family_count,
      'directLinkFamilies', v_direct_families,
      'directLinkSignals', v_direct_signals,
      'strongDirectLink', v_direct_family_count >= 2
    ),
    'OPERATOR',
    new.imposed_at
  )
  on conflict (network, invite_code) do nothing;

  return new;
end;
$$;

revoke all on function public.capture_sybil_v2_inviter_incident()
  from public, anon, authenticated, service_role;

drop trigger if exists capture_sybil_v2_inviter_incident_on_restriction
  on public.sybil_v2_wallet_restrictions;
create trigger capture_sybil_v2_inviter_incident_on_restriction
after insert or update of status on public.sybil_v2_wallet_restrictions
for each row execute function public.capture_sybil_v2_inviter_incident();

create or replace view public.operator_sybil_v2_inviter_postures
with (security_invoker = true)
as
with recent as (
  select *
  from public.sybil_v2_inviter_incidents
  where recorded_at >= clock_timestamp() - interval '90 days'
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
    'policy',
      jsonb_build_object(
        'firstIncident', 'RECORDED',
        'secondIncident', 'WATCH',
        'thirdIncident', 'HOLD',
        'strongDirectLinkIndependentFamilies', 2
      )
  ) as evidence_summary,
  a.latest_invite_code,
  a.latest_incident_at
from aggregated a;

revoke all on public.operator_sybil_v2_inviter_postures
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_inviter_postures to service_role;

comment on view public.operator_sybil_v2_inviter_postures is
  'Service-only rolling 90-day inviter escalation posture. 1 confirmed blacklisted invitee = RECORDED, 2 = WATCH, 3 = HOLD. A single incident can HOLD only when at least two independent direct-link evidence families connect the invitee to the inviter.';

create or replace view public.operator_sybil_v2_temporary_participation_holds
with (security_invoker = true)
as
select
  ('preclaim:' || a.invite_code || ':invitee')::text as id,
  a.network,
  lower(i.invitee_wallet) as wallet_address,
  'PRE_CLAIM_HOLD'::text as restriction_kind,
  a.reason_codes,
  a.evidence_summary,
  a.invite_code as related_invite_code,
  a.updated_at as imposed_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD'
  and i.invitee_wallet is not null

union all

select
  ('postpayout:' || r.invite_code || ':recipient')::text as id,
  r.network,
  lower(r.subject_wallet) as wallet_address,
  'POST_PAYOUT_HOLD'::text as restriction_kind,
  r.reason_codes,
  r.evidence_summary,
  r.invite_code as related_invite_code,
  r.updated_at as imposed_at
from public.sybil_v2_post_payout_reviews r
where public.sybil_v2_enforcement_enabled()
  and r.state = 'HOLD'

union all

select
  ('inviter-escalation:' || p.network || ':' || p.inviter_wallet)::text as id,
  p.network,
  p.inviter_wallet as wallet_address,
  'INVITER_ESCALATION_HOLD'::text as restriction_kind,
  p.reason_codes,
  p.evidence_summary,
  p.latest_invite_code as related_invite_code,
  p.latest_incident_at as imposed_at
from public.operator_sybil_v2_inviter_postures p
where public.sybil_v2_enforcement_enabled()
  and p.posture = 'HOLD';

revoke all on public.operator_sybil_v2_temporary_participation_holds
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_temporary_participation_holds
  to service_role;

comment on view public.operator_sybil_v2_temporary_participation_holds is
  'Service-only temporary participation block list. PRE_CLAIM HOLD pauses only the invitee under review; POST_PAYOUT HOLD pauses only the already-paid reward recipient; INVITER_ESCALATION_HOLD applies the rolling 90-day graduated inviter policy. Past rewards are never changed.';

commit;
