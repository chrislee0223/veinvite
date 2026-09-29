begin;

-- Extend confirmed-hub enforcement without weakening the hub/link prerequisites.
-- A subject still needs both HIGH common-sink and sink-as-inviter evidence to an
-- ACTIVE operator-confirmed malicious hub. Corroboration may now come from the
-- original synchronized-reward signature, a HIGH dense B3TR burst to that same
-- hub, or an independent MEDIUM/HIGH mission-pattern cluster. This closes the
-- pre-vote HOLD gap observed in the current returning-user cohort while keeping
-- hub linkage alone non-authoritative.

create or replace function public.apply_sybil_v2_confirmed_cluster_blacklist(
  p_invite_code text,
  p_expected_revision bigint,
  p_hub_wallet text,
  p_signature_code text,
  p_network text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_hub text := lower(btrim(p_hub_wallet));
  v_signature text := btrim(p_signature_code);
  v_network text := lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_confirmed public.sybil_v2_confirmed_cluster_hubs%rowtype;
  v_record jsonb;
  v_now timestamptz := clock_timestamp();
  v_reason text;
  v_sync boolean := false;
  v_dense boolean := false;
  v_mission boolean := false;
  v_corroboration text := null;
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
  if v_signature <> 'SYNC_REWARD_COMMON_SINK_INVITER_V1' then
    raise exception 'UNSUPPORTED_CLUSTER_SIGNATURE';
  end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_NETWORK';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_sybil_v2_confirmed_cluster_' || v_code, 0)
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

  select *
  into v_confirmed
  from public.sybil_v2_confirmed_cluster_hubs h
  where h.network = v_network
    and h.wallet_address = v_hub
    and h.signature_code = v_signature
    and h.status = 'ACTIVE'
    and not exists (
      select 1
      from public.sybil_v2_cluster_hub_allowlist a
      where a.network = h.network
        and a.wallet_address = h.wallet_address
    );

  if not found then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'CLUSTER_NOT_ACTIVE_OR_ALLOWLISTED'
    );
  end if;

  if (
    select count(distinct e.signal_code)
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and lower(e.related_wallet) = v_hub
      and e.signal_code in (
        'HISTORICAL_COMMON_B3TR_SINK',
        'HISTORICAL_SINK_REAPPEARS_AS_INVITER'
      )
      and e.strength = 'HIGH'
      and e.score > 0
  ) <> 2 then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'CONFIRMED_CLUSTER_SIGNATURE_MISMATCH'
    );
  end if;

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.signal_code = 'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER'
      and e.strength = 'HIGH'
      and e.score > 0
  ) into v_sync;

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.subject_wallet = lower(v_invitation.invitee_wallet)
      and e.signal_code = 'HISTORICAL_DENSE_B3TR_BURST'
      and e.strength = 'HIGH'
      and e.score > 0
      and lower(e.related_wallet) = v_hub
  ) into v_dense;

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.signal_code = 'MISSION_PATTERN_CLUSTER'
      and e.strength in ('MEDIUM','HIGH')
      and e.score > 0
  ) into v_mission;

  if v_sync then
    v_corroboration := 'SYNCHRONIZED_REWARD';
  elsif v_dense then
    v_corroboration := 'DENSE_B3TR_BURST';
  elsif v_mission then
    v_corroboration := 'MISSION_PATTERN_CLUSTER';
  else
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'CONFIRMED_CLUSTER_CORROBORATION_MISSING'
    );
  end if;

  v_reason :=
    'Automatic blacklist: active operator-confirmed malicious hub relationship reproduced with strong corroborating evidence.';

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
        || jsonb_build_array('AUTO_CONFIRMED_CLUSTER_BLACKLIST'),
      v_assessment.evidence_summary
        || jsonb_build_object(
          'automaticDecision', 'BLACKLIST',
          'confirmedClusterHub', v_hub,
          'confirmedClusterSignature', v_signature,
          'clusterConfirmedAt', v_confirmed.confirmed_at,
          'retrospectiveUnpaidEnforcement', true,
          'confirmedClusterCorroboration', v_corroboration,
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
      || jsonb_build_array('AUTO_CONFIRMED_CLUSTER_BLACKLIST'),
    v_assessment.evidence_summary
      || jsonb_build_object(
        'automaticDecision', 'BLACKLIST',
        'confirmedClusterHub', v_hub,
        'confirmedClusterSignature', v_signature,
        'clusterConfirmedAt', v_confirmed.confirmed_at,
        'retrospectiveUnpaidEnforcement', true,
        'automaticDecidedAt', v_now
      ),
    'SYSTEM',
    v_assessment.revision
  );

  return jsonb_build_object(
    'changed', true,
    'state', 'RESTRICTED',
    'revision', v_record ->> 'revision',
    'reason', 'AUTO_CONFIRMED_CLUSTER_BLACKLIST',
    'restrictedWallet', lower(v_invitation.invitee_wallet),
    'confirmedClusterHub', v_hub
  );
end;
$$;

revoke all on function public.apply_sybil_v2_confirmed_cluster_blacklist(
  text, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.apply_sybil_v2_confirmed_cluster_blacklist(
  text, bigint, text, text, text
) to service_role;

comment on function public.apply_sybil_v2_confirmed_cluster_blacklist(
  text, bigint, text, text, text
) is
  'Promotes an unpaid/unassigned SYSTEM HOLD only when it links to an ACTIVE operator-confirmed malicious hub through HIGH common-sink and sink-as-inviter evidence, plus synchronized rewards, a HIGH dense B3TR burst to that hub, or a MEDIUM/HIGH mission-pattern cluster. Hub linkage alone is insufficient; paid rewards, assigned payouts, allowlisted hubs, and operator decisions are protected.';

commit;
