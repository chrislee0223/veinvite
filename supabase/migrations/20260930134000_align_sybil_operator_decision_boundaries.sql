begin;

alter table public.sybil_v2_inviter_incidents
  drop constraint if exists sybil_v2_inviter_incidents_source_check;

alter table public.sybil_v2_inviter_incidents
  add constraint sybil_v2_inviter_incidents_source_check
  check (source in ('OPERATOR','SYSTEM'));

create or replace function public.capture_sybil_v2_inviter_incident()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_invitation public.invitations%rowtype;
  v_direct_families jsonb := '[]'::jsonb;
  v_direct_signals jsonb := '[]'::jsonb;
  v_direct_family_count integer := 0;
begin
  if new.status <> 'ACTIVE'
     or new.source not in ('OPERATOR','SYSTEM')
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
      'restrictionSource', new.source,
      'restrictionReasonCodes', new.reason_codes,
      'directLinkFamilyCount', v_direct_family_count,
      'directLinkFamilies', v_direct_families,
      'directLinkSignals', v_direct_signals,
      'strongDirectLink', v_direct_family_count >= 2
    ),
    new.source,
    new.imposed_at
  )
  on conflict (network, invite_code) do nothing;

  return new;
end;
$function$;

revoke all on function public.capture_sybil_v2_inviter_incident()
from public, anon, authenticated;

alter table public.sybil_v2_inviter_incidents
  disable trigger sybil_v2_inviter_incident_security_notification;

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
)
select
  r.network,
  r.related_invite_code,
  lower(i.inviter_wallet),
  lower(i.invitee_wallet),
  r.id,
  coalesce(e.direct_link_families, '[]'::jsonb),
  coalesce(e.direct_link_signals, '[]'::jsonb),
  jsonb_build_array('CONFIRMED_INVITEE_BLACKLIST'),
  jsonb_build_object(
    'restrictionId', r.id,
    'restrictionSource', r.source,
    'restrictionReasonCodes', r.reason_codes,
    'directLinkFamilyCount',
      jsonb_array_length(coalesce(e.direct_link_families,'[]'::jsonb)),
    'directLinkFamilies',
      coalesce(e.direct_link_families,'[]'::jsonb),
    'directLinkSignals',
      coalesce(e.direct_link_signals,'[]'::jsonb),
    'strongDirectLink',
      jsonb_array_length(coalesce(e.direct_link_families,'[]'::jsonb)) >= 2,
    'backfilledFromExistingRestriction', true
  ),
  r.source,
  r.imposed_at
from public.sybil_v2_wallet_restrictions r
join public.invitations i
  on i.invite_code = r.related_invite_code
 and i.invitee_wallet is not null
 and lower(i.invitee_wallet) = lower(r.wallet_address)
left join lateral (
  select
    coalesce(
      jsonb_agg(distinct x.evidence_family)
        filter (where x.evidence_family is not null),
      '[]'::jsonb
    ) as direct_link_families,
    coalesce(
      jsonb_agg(distinct x.signal_code)
        filter (where x.signal_code is not null),
      '[]'::jsonb
    ) as direct_link_signals
  from public.sybil_v2_evidence_records x
  where x.invite_code = r.related_invite_code
    and x.related_wallet = lower(i.inviter_wallet)
    and x.signal_code in (
      'SECURITY_CLIENT_INVITER_LINK',
      'RECENT_B3TR_FROM_INVITER',
      'RECENT_VET_FROM_INVITER',
      'RECENT_VTHO_FROM_INVITER',
      'HISTORICAL_SINK_REAPPEARS_AS_INVITER'
    )
) e on true
where r.status = 'ACTIVE'
  and r.source = 'SYSTEM'
  and r.related_invite_code is not null
on conflict (network, invite_code) do nothing;

alter table public.sybil_v2_inviter_incidents
  enable trigger sybil_v2_inviter_incident_security_notification;

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
    recent.network,
    recent.inviter_wallet,
    count(*) as incident_count_90d,
    count(*) filter (
      where jsonb_array_length(recent.direct_link_families) >= 2
    ) as strong_direct_link_incident_count_90d,
    max(recent.recorded_at) as latest_incident_at,
    (array_agg(
      recent.invite_code
      order by recent.recorded_at desc, recent.id desc
    ))[1] as latest_invite_code,
    (array_agg(
      recent.id
      order by recent.recorded_at desc, recent.id desc
    ))[1] as latest_incident_id
  from recent
  group by recent.network, recent.inviter_wallet
)
select
  network,
  inviter_wallet,
  incident_count_90d,
  strong_direct_link_incident_count_90d,
  case
    when strong_direct_link_incident_count_90d > 0 then 'HOLD'::text
    when incident_count_90d >= 2 then 'WATCH'::text
    else 'RECORDED'::text
  end as posture,
  case
    when strong_direct_link_incident_count_90d > 0 then
      jsonb_build_array(
        'INVITER_STRONG_DIRECT_LINK',
        'CONFIRMED_INVITEE_BLACKLIST'
      )
    when incident_count_90d >= 3 then
      jsonb_build_array(
        'INVITER_REPEAT_BLACKLIST_3_IN_90D',
        'CONFIRMED_INVITEE_BLACKLIST'
      )
    when incident_count_90d = 2 then
      jsonb_build_array(
        'INVITER_REPEAT_BLACKLIST_2_IN_90D',
        'CONFIRMED_INVITEE_BLACKLIST'
      )
    else
      jsonb_build_array('CONFIRMED_INVITEE_BLACKLIST')
  end as reason_codes,
  jsonb_build_object(
    'windowDays', 90,
    'incidentCount90d', incident_count_90d,
    'strongDirectLinkIncidentCount90d',
      strong_direct_link_incident_count_90d,
    'activeRestrictionsOnly', true,
    'policy', jsonb_build_object(
      'firstIncident', 'RECORDED',
      'secondIncident', 'WATCH',
      'thirdIncident', 'WATCH',
      'repeatOnlyEscalation', 'WATCH',
      'manualReviewRequiresStrongDirectLink', true,
      'strongDirectLinkIndependentFamilies', 2,
      'reinstatedIncidentsCount', false
    )
  ) as evidence_summary,
  latest_invite_code,
  latest_incident_at,
  latest_incident_id
from aggregated;

revoke all on public.operator_sybil_v2_inviter_postures
from public, anon, authenticated;
grant select on public.operator_sybil_v2_inviter_postures
to service_role;


create or replace function public.notify_sybil_v2_inviter_incident_history()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_posture record;
  v_new_strong boolean := false;
  v_previous_count bigint := 0;
  v_previous_strong bigint := 0;
  v_previous_hold boolean := false;
  v_previous_latest_incident_id uuid := null;
  v_previous_unresolved_hold boolean := false;
  v_current_unresolved_hold boolean := false;
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  select *
  into v_posture
  from public.operator_sybil_v2_inviter_postures p
  where p.network = new.network
    and p.inviter_wallet = new.inviter_wallet;

  if not found then
    return new;
  end if;

  v_new_strong := jsonb_array_length(new.direct_link_families) >= 2;
  v_previous_count := greatest(v_posture.incident_count_90d - 1, 0);
  v_previous_strong := greatest(
    v_posture.strong_direct_link_incident_count_90d
      - case when v_new_strong then 1 else 0 end,
    0
  );
  v_previous_hold := v_previous_strong > 0;

  if v_previous_hold then
    select i.id
    into v_previous_latest_incident_id
    from public.sybil_v2_inviter_incidents i
    join public.sybil_v2_wallet_restrictions r
      on r.id = i.restriction_id
     and r.status = 'ACTIVE'
    where i.network = new.network
      and i.inviter_wallet = new.inviter_wallet
      and i.id <> new.id
      and i.recorded_at >= clock_timestamp() - interval '90 days'
    order by i.recorded_at desc, i.id desc
    limit 1;

    if v_previous_latest_incident_id is not null then
      v_previous_unresolved_hold := not exists (
        select 1
        from public.sybil_v2_inviter_review_decisions d
        where d.network = new.network
          and d.inviter_wallet = new.inviter_wallet
          and d.latest_incident_id = v_previous_latest_incident_id
      );
    end if;
  end if;

  select exists (
    select 1
    from public.operator_sybil_v2_inviter_review_candidates c
    where c.network = new.network
      and c.inviter_wallet = new.inviter_wallet
  )
  into v_current_unresolved_hold;

  if v_posture.posture = 'HOLD'
     and v_current_unresolved_hold
     and not v_previous_unresolved_hold then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_INVITER_HOLD',
      'inviter-hold-' || new.id::text,
      new.recorded_at
    );
  elsif v_posture.posture = 'WATCH'
        and v_previous_count < 2 then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_INVITER_WATCH',
      'inviter-watch-' || new.id::text,
      new.recorded_at
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.notify_sybil_v2_inviter_incident_history()
from public, anon, authenticated;

create or replace view public.operator_sybil_v2_manual_review_candidates
with (security_invoker = true)
as
select a.*
from public.sybil_v2_referral_assessments a
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD'
  and coalesce(a.required_checks,'[]'::jsonb)
      <@ coalesce(a.completed_checks,'[]'::jsonb);

revoke all on public.operator_sybil_v2_manual_review_candidates
from public, anon, authenticated;
grant select on public.operator_sybil_v2_manual_review_candidates
to service_role;

create or replace function public.guard_sybil_v2_operator_decision_readiness()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
begin
  if new.source = 'OPERATOR'
     and old.state = 'HOLD'
     and new.state in ('CLEAR','RESTRICTED')
     and not (
       coalesce(old.required_checks,'[]'::jsonb)
       <@ coalesce(old.completed_checks,'[]'::jsonb)
     ) then
    raise exception 'SYBIL_V2_REVIEW_CHECKS_INCOMPLETE';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_sybil_v2_operator_decision_readiness()
from public, anon, authenticated;

drop trigger if exists
  sybil_v2_operator_decision_readiness_guard
on public.sybil_v2_referral_assessments;

create trigger sybil_v2_operator_decision_readiness_guard
before update on public.sybil_v2_referral_assessments
for each row
execute function public.guard_sybil_v2_operator_decision_readiness();

create or replace function public.align_operator_monitor_sybil_v2_review_readiness()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_ready bigint := 0;
  v_filtered_alerts jsonb := '[]'::jsonb;
  v_sybil_metrics jsonb := '{}'::jsonb;
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  select count(*)::bigint
  into v_ready
  from public.operator_sybil_v2_manual_review_candidates c
  where c.network = new.network;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_filtered_alerts
  from jsonb_array_elements(coalesce(new.alerts,'[]'::jsonb)) item
  where item ->> 'code' <> 'SYBIL_V2_OPERATOR_REVIEW_REQUIRED';

  if v_ready > 0 then
    v_filtered_alerts :=
      v_filtered_alerts || jsonb_build_array(
        jsonb_build_object(
          'code', 'SYBIL_V2_OPERATOR_REVIEW_REQUIRED',
          'severity', 'WARNING',
          'observed', v_ready,
          'message',
            'One or more fully assessed Sybil v2 HOLD referrals require operator review.'
        )
      );
  end if;

  v_sybil_metrics :=
    coalesce(new.metrics -> 'sybilV2', '{}'::jsonb)
    || jsonb_build_object(
      'manualReviewReadyReferrals', v_ready
    );

  new.metrics :=
    coalesce(new.metrics,'{}'::jsonb)
    || jsonb_build_object('sybilV2', v_sybil_metrics);
  new.alerts := v_filtered_alerts;
  new.alert_count := jsonb_array_length(new.alerts);
  new.severity := case
    when new.alerts @> '[{"severity":"CRITICAL"}]'::jsonb
      then 'CRITICAL'
    when new.alert_count > 0
      then 'WARNING'
    else 'NORMAL'
  end;

  return new;
end;
$function$;

revoke all on function public.align_operator_monitor_sybil_v2_review_readiness()
from public, anon, authenticated;

drop trigger if exists
  zzzz_operator_monitor_sybil_v2_review_readiness
on public.operator_monitor_snapshots;

create trigger zzzz_operator_monitor_sybil_v2_review_readiness
before insert on public.operator_monitor_snapshots
for each row
execute function public.align_operator_monitor_sybil_v2_review_readiness();

comment on view public.operator_sybil_v2_manual_review_candidates is
  'Service-only Sybil v2 HOLD referrals whose required automatic checks are all complete. Intermediate HOLDs remain fail-closed for rewards but are not operator decisions yet.';

comment on view public.operator_sybil_v2_inviter_postures is
  'Service-only inviter posture. Repeated confirmed bad referrals remain WATCH without blocking invitations; HOLD requires a strong direct inviter-link incident supported by at least two independent evidence families.';

commit;
