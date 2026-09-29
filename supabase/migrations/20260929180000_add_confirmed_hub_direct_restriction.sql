begin;

-- Canonical repository copy of the verified Production migration
-- add_confirmed_hub_direct_restriction. This function is intentionally narrow:
-- direct transfer to a confirmed hub is never sufficient without independent
-- mission, funding, or identity corroboration.

CREATE OR REPLACE FUNCTION public.apply_sybil_v2_confirmed_hub_direct_restriction(p_invite_code text, p_expected_revision bigint, p_hub_wallet text, p_network text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_hub text := lower(btrim(p_hub_wallet));
  v_network text := lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_first_reward_block bigint;
  v_mission boolean := false;
  v_funding boolean := false;
  v_identity boolean := false;
  v_corroboration text := null;
  v_record jsonb;
  v_now timestamptz := clock_timestamp();
  v_reason text;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'INVALID_ASSESSMENT_REVISION';
  end if;
  if v_hub !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_CLUSTER_HUB';
  end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_NETWORK';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_sybil_v2_confirmed_hub_direct_' || v_code, 0)
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

  if not found or v_invitation.invitee_wallet is null then
    raise exception 'SYBIL_V2_INVITATION_NOT_FOUND';
  end if;

  if v_invitation.reward_status = 'PAID' then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'REWARD_ALREADY_PAID'
    );
  end if;

  if exists (
    select 1
    from public.reward_queue_entries q
    where q.invite_code = v_code
      and q.status = 'ASSIGNED'
  ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'REWARD_ALREADY_ASSIGNED'
    );
  end if;

  if exists (
    select 1
    from public.sybil_v2_cluster_hub_allowlist a
    where a.network = v_network
      and a.wallet_address = v_hub
  ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'HUB_ALLOWLISTED'
    );
  end if;

  if not exists (
    select 1
    from public.sybil_v2_confirmed_cluster_hubs h
    where h.network = v_network
      and h.wallet_address = v_hub
      and h.status = 'ACTIVE'
      and h.revoked_at is null
      and h.signature_code = 'SYNC_REWARD_COMMON_SINK_INVITER_V1'
  ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'CONFIRMED_HUB_NOT_ACTIVE'
    );
  end if;

  if not exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.subject_wallet = lower(v_invitation.invitee_wallet)
      and e.signal_code = 'HISTORICAL_DIRECT_CONFIRMED_HUB_TRANSFER'
      and e.strength in ('MEDIUM','HIGH')
      and e.score > 0
      and lower(e.related_wallet) = v_hub
  ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'DIRECT_CONFIRMED_HUB_EVIDENCE_MISSING'
    );
  end if;

  select min(h.block_number)::bigint
  into v_first_reward_block
  from public.sybil_v2_historical_reward_events h
  where h.network = v_network
    and lower(h.wallet_address) = lower(v_invitation.invitee_wallet);

  if v_first_reward_block is null
     or not exists (
       select 1
       from public.sybil_v2_preactivation_b3tr_outflows o
       where o.network = v_network
         and lower(o.wallet_address) = lower(v_invitation.invitee_wallet)
         and lower(o.destination_wallet) = v_hub
         and o.block_number >= v_first_reward_block
     ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'DIRECT_CONFIRMED_HUB_RUNTIME_VERIFICATION_FAILED'
    );
  end if;

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.signal_code = 'MISSION_PATTERN_CLUSTER'
      and e.strength in ('MEDIUM','HIGH')
      and e.score > 0
  ) into v_mission;

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.evidence_family = 'FUNDING'
      and e.strength in ('MEDIUM','HIGH')
      and e.score > 0
  ) into v_funding;

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.evidence_family = 'SECURITY_IDENTITY'
      and e.strength = 'HIGH'
      and e.score > 0
  ) into v_identity;

  if v_mission then
    v_corroboration := 'MISSION_BEHAVIOR';
  elsif v_funding then
    v_corroboration := 'FUNDING';
  elsif v_identity then
    v_corroboration := 'SECURITY_IDENTITY';
  else
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'INSUFFICIENT_INDEPENDENT_CORROBORATION'
    );
  end if;

  v_reason :=
    'Automatic restriction: direct historical transfer to an active confirmed Sybil hub with independent corroborating evidence.';

  update public.invitations
  set
    status = 'CANCELLED',
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
        || jsonb_build_array('AUTO_CONFIRMED_HUB_DIRECT_RESTRICTION'),
      v_assessment.evidence_summary
        || jsonb_build_object(
          'automaticDecision', 'RESTRICT',
          'behaviorPattern', 'CONFIRMED_HUB_DIRECT_WITH_CORROBORATION_V1',
          'confirmedHubDirect', v_hub,
          'corroboration', v_corroboration,
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
      || jsonb_build_array('AUTO_CONFIRMED_HUB_DIRECT_RESTRICTION'),
    v_assessment.evidence_summary
      || jsonb_build_object(
        'automaticDecision', 'RESTRICT',
        'behaviorPattern', 'CONFIRMED_HUB_DIRECT_WITH_CORROBORATION_V1',
        'confirmedHubDirect', v_hub,
        'corroboration', v_corroboration,
        'automaticDecidedAt', v_now
      ),
    'SYSTEM',
    v_assessment.revision
  );

  return jsonb_build_object(
    'changed', true,
    'state', 'RESTRICTED',
    'revision', v_record ->> 'revision',
    'reason', 'AUTO_CONFIRMED_HUB_DIRECT_RESTRICTION',
    'restrictedWallet', lower(v_invitation.invitee_wallet),
    'confirmedHubDirect', v_hub,
    'corroboration', v_corroboration
  );
end;
$function$


revoke all on function public.apply_sybil_v2_confirmed_hub_direct_restriction(
  text, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.apply_sybil_v2_confirmed_hub_direct_restriction(
  text, bigint, text, text
) to service_role;

comment on function public.apply_sybil_v2_confirmed_hub_direct_restriction(
  text, bigint, text, text
) is
  'Restricts only an unpaid current SYSTEM HOLD that directly transferred B3TR to an active operator-confirmed Sybil hub after historical reward activity and also has independent mission, funding, or identity corroboration. Direct hub linkage alone is insufficient.';

commit;
