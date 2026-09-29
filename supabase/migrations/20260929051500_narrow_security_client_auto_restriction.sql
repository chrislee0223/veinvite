-- Narrow automatic same-security-client restriction to an immediate
-- inviter -> invitee wallet switch near VeInvite activation.
-- A generic shared client remains strong HOLD evidence but is not sufficient
-- by itself for an irreversible automatic restriction.

create or replace function public.apply_sybil_v2_security_client_inviter_restriction(
  p_invite_code text,
  p_expected_revision bigint,
  p_network text
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_shared_client uuid;
  v_inviter_last_seen timestamptz;
  v_invitee_first_seen timestamptz;
  v_switch_gap_seconds numeric;
  v_activation_gap_seconds numeric;
  v_record jsonb;
  v_now timestamptz := clock_timestamp();
  v_reason text :=
    'Automatic restriction: inviter and invitee switched on the same VeInvite security client in immediate sequence near activation.';
begin
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_sybil_v2_same_client_' || v_code, 0)
  );

  select * into v_assessment
  from public.sybil_v2_referral_assessments
  where invite_code = v_code
  for update;

  if not found then raise exception 'SYBIL_V2_ASSESSMENT_NOT_FOUND'; end if;
  if v_assessment.network <> v_network then raise exception 'SYBIL_V2_NETWORK_MISMATCH'; end if;
  if v_assessment.revision <> p_expected_revision then raise exception 'SYBIL_V2_REVIEW_STATE_CHANGED'; end if;

  if v_assessment.state <> 'HOLD' or v_assessment.source <> 'SYSTEM' then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'NOT_CURRENT_SYSTEM_HOLD'
    );
  end if;

  select * into v_invitation
  from public.invitations
  where invite_code = v_code
  for update;

  if not found or v_invitation.invitee_wallet is null then
    raise exception 'SYBIL_V2_INVITATION_NOT_FOUND';
  end if;

  if v_invitation.reward_status = 'PAID'
     or exists(
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

  select
    x.client_id,
    y.last_seen_at,
    x.first_seen_at,
    extract(epoch from (x.first_seen_at - y.last_seen_at)),
    abs(extract(epoch from (v_invitation.activated_at - x.first_seen_at)))
  into
    v_shared_client,
    v_inviter_last_seen,
    v_invitee_first_seen,
    v_switch_gap_seconds,
    v_activation_gap_seconds
  from public.security_client_wallet_observations x
  join public.security_client_wallet_observations y
    on y.client_id = x.client_id
  where lower(x.wallet_address) = lower(v_invitation.invitee_wallet)
    and lower(y.wallet_address) = lower(v_invitation.inviter_wallet)
    and v_invitation.activated_at is not null
    and x.first_seen_at >= y.last_seen_at
    and x.first_seen_at <= y.last_seen_at + interval '10 minutes'
    and abs(extract(epoch from (v_invitation.activated_at - x.first_seen_at))) <= 600
  order by x.first_seen_at - y.last_seen_at asc
  limit 1;

  if v_shared_client is null then
    return jsonb_build_object(
      'changed', false,
      'state', 'HOLD',
      'revision', v_assessment.revision,
      'reason', 'SAME_CLIENT_IMMEDIATE_SWITCH_NOT_CONFIRMED'
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

  if not exists(
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
      v_assessment.reason_codes ||
        jsonb_build_array('AUTO_SECURITY_CLIENT_INVITER_RESTRICTION'),
      v_assessment.evidence_summary || jsonb_build_object(
        'automaticDecision', 'RESTRICT',
        'behaviorPattern', 'SECURITY_CLIENT_INVITER_IMMEDIATE_SWITCH_V1',
        'sharedClientId', v_shared_client,
        'inviterLastSeenAt', v_inviter_last_seen,
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
    v_assessment.reason_codes ||
      jsonb_build_array('AUTO_SECURITY_CLIENT_INVITER_RESTRICTION'),
    v_assessment.evidence_summary || jsonb_build_object(
      'automaticDecision', 'RESTRICT',
      'behaviorPattern', 'SECURITY_CLIENT_INVITER_IMMEDIATE_SWITCH_V1',
      'sharedClientId', v_shared_client,
      'inviterLastSeenAt', v_inviter_last_seen,
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
    'reason', 'AUTO_SECURITY_CLIENT_INVITER_RESTRICTION',
    'restrictedWallet', lower(v_invitation.invitee_wallet),
    'switchGapSeconds', v_switch_gap_seconds,
    'activationGapSeconds', v_activation_gap_seconds
  );
end;
$$;

revoke all on function public.apply_sybil_v2_security_client_inviter_restriction(text,bigint,text)
from public, anon, authenticated;

grant execute on function public.apply_sybil_v2_security_client_inviter_restriction(text,bigint,text)
to service_role;
