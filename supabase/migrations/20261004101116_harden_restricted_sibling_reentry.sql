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

create or replace function public.apply_sybil_v2_restricted_sibling_reentry_restriction(
  p_invite_code text,
  p_expected_revision bigint,
  p_network text
) returns jsonb
language plpgsql
security invoker
set search_path to 'pg_catalog','public'
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_peer_invite_code text;
  v_peer_wallet text;
  v_shared_client uuid;
  v_peer_last_seen timestamptz;
  v_invitee_first_seen timestamptz;
  v_switch_gap_seconds numeric;
  v_activation_gap_seconds numeric;
  v_record jsonb;
  v_now timestamptz := clock_timestamp();
  v_reason text :=
    'Automatic restriction: a new invitee wallet immediately replaced a confirmed restricted invitee from the same inviter on the same VeInvite security client near activation.';
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'INVALID_ASSESSMENT_REVISION';
  end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_NETWORK';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_sybil_v2_restricted_sibling_reentry_' || v_code, 0)
  );

  select *
  into v_assessment
  from public.sybil_v2_referral_assessments
  where invite_code = v_code
  for update;

  if not found then
    raise exception 'SYBIL_V2_ASSESSMENT_NOT_FOUND';
  end if;
  if v_assessment.network <> v_network then
    raise exception 'SYBIL_V2_NETWORK_MISMATCH';
  end if;
  if v_assessment.revision <> p_expected_revision then
    raise exception 'SYBIL_V2_REVIEW_STATE_CHANGED';
  end if;

  if v_assessment.state <> 'HOLD'
     or v_assessment.source <> 'SYSTEM' then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'NOT_CURRENT_SYSTEM_HOLD'
    );
  end if;

  select *
  into v_invitation
  from public.invitations
  where invite_code = v_code
  for update;

  if not found
     or v_invitation.invitee_wallet is null
     or v_invitation.activated_at is null then
    raise exception 'SYBIL_V2_INVITATION_NOT_FOUND';
  end if;

  if v_invitation.reward_status = 'PAID'
     or exists (
       select 1
       from public.reward_queue_entries q
       where q.invite_code = v_code
         and q.status = 'ASSIGNED'
     ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'REWARD_ALREADY_FINAL'
    );
  end if;

  if public.is_analytics_excluded_wallet(v_invitation.inviter_wallet)
     or public.is_analytics_excluded_wallet(v_invitation.invitee_wallet) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'ANALYTICS_EXCLUDED_WALLET'
    );
  end if;

  select
    p.invite_code,
    lower(p.invitee_wallet),
    current_obs.client_id,
    peer_obs.last_seen_at,
    current_obs.first_seen_at,
    extract(epoch from (current_obs.first_seen_at - peer_obs.last_seen_at)),
    abs(extract(epoch from (
      v_invitation.activated_at - current_obs.first_seen_at
    )))
  into
    v_peer_invite_code,
    v_peer_wallet,
    v_shared_client,
    v_peer_last_seen,
    v_invitee_first_seen,
    v_switch_gap_seconds,
    v_activation_gap_seconds
  from public.invitations p
  join public.sybil_v2_wallet_restrictions r
    on r.network = v_network
   and r.status = 'ACTIVE'
   and r.resolved_at is null
   and r.related_invite_code = p.invite_code
   and lower(r.wallet_address) = lower(p.invitee_wallet)
  join public.security_client_wallet_observations current_obs
    on lower(current_obs.wallet_address) = lower(v_invitation.invitee_wallet)
  join public.security_client_wallet_observations peer_obs
    on peer_obs.client_id = current_obs.client_id
   and lower(peer_obs.wallet_address) = lower(p.invitee_wallet)
  where p.invitee_wallet is not null
    and p.invite_code <> v_code
    and lower(p.inviter_wallet) = lower(v_invitation.inviter_wallet)
    and lower(p.invitee_wallet) <> lower(v_invitation.invitee_wallet)
    and current_obs.first_seen_at >= peer_obs.last_seen_at
    and current_obs.first_seen_at <= peer_obs.last_seen_at + interval '10 minutes'
    and abs(extract(epoch from (
      v_invitation.activated_at - current_obs.first_seen_at
    ))) <= 600
    and not public.is_analytics_excluded_wallet(p.invitee_wallet)
  order by
    current_obs.first_seen_at - peer_obs.last_seen_at asc,
    r.imposed_at desc
  limit 1;

  if v_shared_client is null then
    return jsonb_build_object(
      'changed', false,
      'state', 'HOLD',
      'revision', v_assessment.revision,
      'reason', 'RESTRICTED_SIBLING_REENTRY_NOT_CONFIRMED'
    );
  end if;

  update public.invitations
  set
    status = 'CANCELLED',
    reward_status = 'FORFEITED',
    sybil_status = 'BLOCKED',
    sybil_risk_level = 'HIGH',
    sybil_risk_score = 100,
    sybil_reason = v_reason,
    sybil_checked_at = v_now,
    sybil_source = 'SYSTEM'
  where invite_code = v_code;

  if not exists (
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network = v_network
      and r.wallet_address = lower(v_invitation.invitee_wallet)
      and r.status = 'ACTIVE'
      and r.resolved_at is null
  ) then
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
      lower(v_invitation.invitee_wallet),
      v_network,
      'ACTIVE',
      v_assessment.reason_codes
        || jsonb_build_array('AUTO_RESTRICTED_SIBLING_REENTRY_RESTRICTION'),
      v_assessment.evidence_summary
        || jsonb_build_object(
          'automaticDecision', 'RESTRICT',
          'behaviorPattern', 'RESTRICTED_SIBLING_WALLET_REENTRY_V1',
          'peerInviteCode', v_peer_invite_code,
          'peerWallet', v_peer_wallet,
          'sharedClientId', v_shared_client,
          'peerLastSeenAt', v_peer_last_seen,
          'inviteeFirstSeenAt', v_invitee_first_seen,
          'switchGapSeconds', v_switch_gap_seconds,
          'activationGapSeconds', v_activation_gap_seconds,
          'restrictionScope', 'INVITEE_ONLY'
        ),
      'SYSTEM',
      v_code,
      v_now
    );
  end if;

  v_record := public.record_sybil_v2_assessment(
    v_code,
    v_network,
    'RESTRICTED',
    100,
    v_assessment.policy_version,
    v_assessment.analyzer_version,
    v_assessment.evidence_cutoff_block,
    v_assessment.required_checks,
    v_assessment.completed_checks,
    v_assessment.reason_codes
      || jsonb_build_array('AUTO_RESTRICTED_SIBLING_REENTRY_RESTRICTION'),
    v_assessment.evidence_summary
      || jsonb_build_object(
        'automaticDecision', 'RESTRICT',
        'behaviorPattern', 'RESTRICTED_SIBLING_WALLET_REENTRY_V1',
        'peerInviteCode', v_peer_invite_code,
        'peerWallet', v_peer_wallet,
        'sharedClientId', v_shared_client,
        'peerLastSeenAt', v_peer_last_seen,
        'inviteeFirstSeenAt', v_invitee_first_seen,
        'switchGapSeconds', v_switch_gap_seconds,
        'activationGapSeconds', v_activation_gap_seconds,
        'automaticDecidedAt', v_now
      ),
    'SYSTEM',
    v_assessment.revision
  );

  return jsonb_build_object(
    'changed', true,
    'state', 'RESTRICTED',
    'revision', v_record ->> 'revision',
    'reason', 'AUTO_RESTRICTED_SIBLING_REENTRY_RESTRICTION',
    'restrictedWallet', lower(v_invitation.invitee_wallet),
    'peerInviteCode', v_peer_invite_code,
    'peerWallet', v_peer_wallet,
    'switchGapSeconds', v_switch_gap_seconds,
    'activationGapSeconds', v_activation_gap_seconds
  );
end;
$$;

revoke all on function public.apply_sybil_v2_restricted_sibling_reentry_restriction(
  text, bigint, text
) from public, anon, authenticated;

grant execute on function public.apply_sybil_v2_restricted_sibling_reentry_restriction(
  text, bigint, text
) to service_role;

comment on function public.apply_sybil_v2_restricted_sibling_reentry_restriction(
  text, bigint, text
) is
  'Restricts only an unpaid current SYSTEM HOLD when the same inviter previously referred a currently restricted peer wallet, the peer and current invitee share one VeInvite security client, the client switches from peer to current wallet within 10 minutes, and current activation occurs within 10 minutes of the new wallet observation. Shared-client membership alone never restricts.';

commit;
