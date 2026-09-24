begin;

create table if not exists public.sybil_v2_inviter_review_decisions (
  id uuid primary key default gen_random_uuid(),
  network text not null
    check (network in ('mainnet','testnet','testnet-staging')),
  inviter_wallet text not null
    check (inviter_wallet ~ '^0x[0-9a-f]{40}$'),
  latest_incident_id uuid not null
    references public.sybil_v2_inviter_incidents(id) on update cascade on delete restrict,
  latest_invite_code text not null
    references public.invitations(invite_code) on update cascade on delete restrict,
  decision text not null
    check (decision in ('CLEAR','RESTRICT')),
  incident_count_90d bigint not null
    check (incident_count_90d >= 1),
  strong_direct_link_incident_count_90d bigint not null
    check (strong_direct_link_incident_count_90d >= 0),
  reason_codes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reason_codes) = 'array'),
  evidence_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_summary) = 'object'),
  operator_wallet text not null
    check (operator_wallet ~ '^0x[0-9a-f]{40}$'),
  operator_reason text not null
    check (length(operator_reason) between 12 and 500),
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(network, inviter_wallet, latest_incident_id)
);

create index if not exists sybil_v2_inviter_review_decisions_incident_idx
  on public.sybil_v2_inviter_review_decisions(latest_incident_id);
create index if not exists sybil_v2_inviter_review_decisions_invite_idx
  on public.sybil_v2_inviter_review_decisions(latest_invite_code);
create index if not exists sybil_v2_inviter_review_decisions_wallet_idx
  on public.sybil_v2_inviter_review_decisions(network, inviter_wallet, decided_at desc);

alter table public.sybil_v2_inviter_review_decisions enable row level security;
revoke all on public.sybil_v2_inviter_review_decisions from public, anon, authenticated;
grant select, insert on public.sybil_v2_inviter_review_decisions to service_role;

drop trigger if exists sybil_v2_inviter_review_decisions_append_only
  on public.sybil_v2_inviter_review_decisions;
create trigger sybil_v2_inviter_review_decisions_append_only
before update or delete on public.sybil_v2_inviter_review_decisions
for each row execute function public.prevent_sybil_v2_append_only_mutation();

comment on table public.sybil_v2_inviter_review_decisions is
  'Append-only operator decisions for an inviter escalation HOLD snapshot. CLEAR releases that snapshot; RESTRICT additionally creates an ACTIVE wallet restriction. A later confirmed incident creates a new snapshot and can reopen review.';

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
    (array_agg(invite_code order by recorded_at desc, id desc))[1]
      as latest_invite_code,
    (array_agg(id order by recorded_at desc, id desc))[1]
      as latest_incident_id
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
  a.latest_incident_at,
  a.latest_incident_id
from aggregated a;

revoke all on public.operator_sybil_v2_inviter_postures
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_inviter_postures to service_role;

create or replace view public.operator_sybil_v2_inviter_review_candidates
with (security_invoker = true)
as
select
  p.network,
  p.inviter_wallet,
  p.incident_count_90d,
  p.strong_direct_link_incident_count_90d,
  p.posture,
  p.reason_codes,
  p.evidence_summary,
  p.latest_invite_code,
  p.latest_incident_at,
  p.latest_incident_id
from public.operator_sybil_v2_inviter_postures p
where public.sybil_v2_enforcement_enabled()
  and p.posture = 'HOLD'
  and not exists (
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network = p.network
      and r.wallet_address = p.inviter_wallet
      and r.status = 'ACTIVE'
  )
  and not exists (
    select 1
    from public.sybil_v2_inviter_review_decisions d
    where d.network = p.network
      and d.inviter_wallet = p.inviter_wallet
      and d.latest_incident_id = p.latest_incident_id
  );

revoke all on public.operator_sybil_v2_inviter_review_candidates
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_inviter_review_candidates to service_role;

comment on view public.operator_sybil_v2_inviter_review_candidates is
  'Service-only unresolved inviter escalation HOLD snapshots. A CLEAR decision releases only the reviewed snapshot; a later incident reopens review. RESTRICT creates a durable ACTIVE wallet restriction.';

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
  ('inviter-escalation:' || c.network || ':' || c.inviter_wallet || ':' || c.latest_incident_id::text)::text as id,
  c.network,
  c.inviter_wallet as wallet_address,
  'INVITER_ESCALATION_HOLD'::text as restriction_kind,
  c.reason_codes,
  c.evidence_summary,
  c.latest_invite_code as related_invite_code,
  c.latest_incident_at as imposed_at
from public.operator_sybil_v2_inviter_review_candidates c;

revoke all on public.operator_sybil_v2_temporary_participation_holds
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_temporary_participation_holds
  to service_role;

comment on view public.operator_sybil_v2_temporary_participation_holds is
  'Service-only temporary participation block list. PRE_CLAIM HOLD pauses only the invitee; POST_PAYOUT HOLD pauses only the paid recipient; unresolved INVITER_ESCALATION_HOLD pauses the inviter until operator CLEAR or RESTRICT. Past rewards are never changed.';

create or replace function public.resolve_sybil_v2_inviter_review(
  p_inviter_wallet text,
  p_decision text,
  p_reason text,
  p_expected_latest_incident_id uuid,
  p_operator_wallet text,
  p_network text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inviter text := lower(btrim(p_inviter_wallet));
  v_decision text := upper(btrim(p_decision));
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
  v_operator text := lower(btrim(p_operator_wallet));
  v_network text := lower(btrim(p_network));
  v_candidate record;
  v_now timestamptz := clock_timestamp();
  v_restriction_id uuid := null;
begin
  if v_inviter !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_INVITER_WALLET';
  end if;
  if v_decision not in ('CLEAR','RESTRICT') then
    raise exception 'INVALID_INVITER_REVIEW_DECISION';
  end if;
  if v_reason is null or length(v_reason) < 12 or length(v_reason) > 500 then
    raise exception 'INVITER_REVIEW_REASON_LENGTH';
  end if;
  if p_expected_latest_incident_id is null then
    raise exception 'INVALID_INVITER_REVIEW_INCIDENT';
  end if;
  if v_operator !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_OPERATOR_WALLET';
  end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_NETWORK';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_sybil_v2_inviter_review_' || v_network || ':' || v_inviter,0)
  );

  select *
  into v_candidate
  from public.operator_sybil_v2_inviter_review_candidates c
  where c.network = v_network
    and c.inviter_wallet = v_inviter;

  if not found then
    raise exception 'INVITER_REVIEW_NOT_HOLD';
  end if;

  if v_candidate.latest_incident_id <> p_expected_latest_incident_id then
    raise exception 'INVITER_REVIEW_STATE_CHANGED';
  end if;

  if v_decision = 'RESTRICT' then
    select r.id into v_restriction_id
    from public.sybil_v2_wallet_restrictions r
    where r.network = v_network
      and r.wallet_address = v_inviter
      and r.status = 'ACTIVE'
    limit 1;

    if v_restriction_id is null then
      insert into public.sybil_v2_wallet_restrictions(
        wallet_address,
        network,
        status,
        reason_codes,
        evidence_summary,
        source,
        related_invite_code,
        imposed_at
      ) values (
        v_inviter,
        v_network,
        'ACTIVE',
        v_candidate.reason_codes || jsonb_build_array('INVITER_ESCALATION_OPERATOR_RESTRICT'),
        v_candidate.evidence_summary || jsonb_build_object(
          'operatorReason', v_reason,
          'operatorWallet', v_operator,
          'operatorDecision', 'RESTRICT',
          'restrictionScope', 'INVITER_ONLY',
          'latestIncidentId', v_candidate.latest_incident_id,
          'latestIncidentAt', v_candidate.latest_incident_at
        ),
        'OPERATOR',
        v_candidate.latest_invite_code,
        v_now
      )
      returning id into v_restriction_id;
    end if;
  end if;

  insert into public.sybil_v2_inviter_review_decisions(
    network,
    inviter_wallet,
    latest_incident_id,
    latest_invite_code,
    decision,
    incident_count_90d,
    strong_direct_link_incident_count_90d,
    reason_codes,
    evidence_summary,
    operator_wallet,
    operator_reason,
    decided_at
  ) values (
    v_network,
    v_inviter,
    v_candidate.latest_incident_id,
    v_candidate.latest_invite_code,
    v_decision,
    v_candidate.incident_count_90d,
    v_candidate.strong_direct_link_incident_count_90d,
    v_candidate.reason_codes,
    v_candidate.evidence_summary,
    v_operator,
    v_reason,
    v_now
  );

  return jsonb_build_object(
    'changed', true,
    'decision', v_decision,
    'state', case when v_decision = 'RESTRICT' then 'RESTRICTED' else 'CLEARED' end,
    'inviterWallet', v_inviter,
    'latestIncidentId', v_candidate.latest_incident_id,
    'latestInviteCode', v_candidate.latest_invite_code,
    'incidentCount90d', v_candidate.incident_count_90d,
    'strongDirectLinkIncidentCount90d',
      v_candidate.strong_direct_link_incident_count_90d,
    'restrictedWallet',
      case when v_decision = 'RESTRICT' then v_inviter else null end,
    'restrictionId', v_restriction_id,
    'pastRewardChanged', false
  );
end;
$$;

revoke all on function public.resolve_sybil_v2_inviter_review(
  text,text,text,uuid,text,text
) from public, anon, authenticated;
grant execute on function public.resolve_sybil_v2_inviter_review(
  text,text,text,uuid,text,text
) to service_role;

create or replace function public.enrich_operator_monitor_snapshot_sybil_v2_inviter()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_open bigint := 0;
  v_over_24h bigint := 0;
  v_over_48h bigint := 0;
  v_extra_alerts jsonb := '[]'::jsonb;
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  select count(*)::bigint
  into v_open
  from public.operator_sybil_v2_inviter_review_candidates c
  where c.network = new.network;

  select count(*)::bigint
  into v_over_24h
  from public.operator_sybil_v2_inviter_review_candidates c
  where c.network = new.network
    and c.latest_incident_at < clock_timestamp() - interval '24 hours';

  select count(*)::bigint
  into v_over_48h
  from public.operator_sybil_v2_inviter_review_candidates c
  where c.network = new.network
    and c.latest_incident_at < clock_timestamp() - interval '48 hours';

  new.metrics := coalesce(new.metrics,'{}'::jsonb) ||
    jsonb_build_object(
      'sybilV2InviterReview',
      jsonb_build_object(
        'openReviews', v_open,
        'openReviewsOver24h', v_over_24h,
        'openReviewsOver48h', v_over_48h,
        'reviewWarningHours', 24,
        'reviewCriticalHours', 48
      )
    );

  if v_open > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_INVITER_REVIEW_REQUIRED',
        'severity', 'WARNING',
        'observed', v_open,
        'message', 'One or more inviters reached the graduated Sybil escalation HOLD threshold and require operator review.'
      )
    );
  end if;

  if v_over_48h > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_INVITER_REVIEW_OVER_48H',
        'severity', 'CRITICAL',
        'observed', v_over_48h,
        'message', 'An inviter escalation HOLD has remained unresolved for over 48 hours.'
      )
    );
  elsif v_over_24h > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_INVITER_REVIEW_OVER_24H',
        'severity', 'WARNING',
        'observed', v_over_24h,
        'message', 'An inviter escalation HOLD has remained unresolved for over 24 hours.'
      )
    );
  end if;

  new.alerts := coalesce(new.alerts,'[]'::jsonb) || v_extra_alerts;
  new.alert_count := jsonb_array_length(new.alerts);
  new.severity := case
    when new.alerts @> '[{"severity":"CRITICAL"}]'::jsonb then 'CRITICAL'
    when new.alert_count > 0 then 'WARNING'
    else 'NORMAL'
  end;

  return new;
end;
$$;

revoke all on function public.enrich_operator_monitor_snapshot_sybil_v2_inviter()
  from public, anon, authenticated, service_role;

drop trigger if exists ac_operator_monitor_sybil_v2_inviter_enrichment
  on public.operator_monitor_snapshots;
create trigger ac_operator_monitor_sybil_v2_inviter_enrichment
before insert on public.operator_monitor_snapshots
for each row execute function public.enrich_operator_monitor_snapshot_sybil_v2_inviter();

commit;
