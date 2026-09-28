begin;

create or replace function public.apply_sybil_v2_behavior_pattern_blacklist(
  p_invite_code text,
  p_expected_revision bigint,
  p_hub_wallet text,
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
  v_network text := lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
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
    hashtextextended(
      'veinvite_sybil_v2_behavior_pattern_' || v_code,
      0
    )
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

  -- Pattern automation never overrides an operator decision and only promotes
  -- a current system HOLD after all normal evidence checks have completed.
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

  -- Independent corroboration 1: the subject repeatedly received the same
  -- historical reward in synchronized windows with multiple peers.
  if not exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.signal_code = 'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER'
      and e.strength = 'HIGH'
      and e.score > 0
  ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'MISSING_SYNCHRONIZED_REWARD_SIGNAL'
    );
  end if;

  -- Independent corroboration 2: at least eight distinct wallets converge on
  -- the same non-protocol destination inside a maximum 30-minute window.
  if not exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.signal_code = 'HISTORICAL_TIGHT_B3TR_CONSOLIDATION_BURST'
      and e.strength = 'HIGH'
      and e.score > 0
      and lower(e.related_wallet) = v_hub
      and coalesce(e.evidence ->> 'burstWalletCount','') ~ '^[0-9]+$'
      and (e.evidence ->> 'burstWalletCount')::integer >= 8
      and coalesce(e.evidence ->> 'burstWindowSeconds','') ~ '^[0-9]+$'
      and (e.evidence ->> 'burstWindowSeconds')::integer <= 1800
  ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'MISSING_TIGHT_B3TR_BURST'
    );
  end if;

  -- Structural corroboration 3+4: the same destination must be both a broad
  -- B3TR sink and an actual VeInvite inviter. A generic exchange/service sink
  -- therefore cannot auto-black merely because many users transferred to it.
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
      'reason', 'COORDINATED_BURST_SIGNATURE_MISMATCH'
    );
  end if;

  v_reason :=
    'Automatic blacklist: synchronized rewards and a tightly timed multi-wallet B3TR consolidation burst reproduced a high-confidence Sybil farming pattern.';

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
        || jsonb_build_array('AUTO_COORDINATED_BURST_BLACKLIST'),
      v_assessment.evidence_summary
        || jsonb_build_object(
          'automaticDecision', 'BLACKLIST',
          'coordinatedBurstHub', v_hub,
          'burstMinimumWallets', 8,
          'burstMaximumWindowSeconds', 1800,
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
      || jsonb_build_array('AUTO_COORDINATED_BURST_BLACKLIST'),
    v_assessment.evidence_summary
      || jsonb_build_object(
        'automaticDecision', 'BLACKLIST',
        'coordinatedBurstHub', v_hub,
        'burstMinimumWallets', 8,
        'burstMaximumWindowSeconds', 1800,
        'automaticDecidedAt', v_now
      ),
    'SYSTEM',
    v_assessment.revision
  );

  return jsonb_build_object(
    'changed', true,
    'state', 'RESTRICTED',
    'revision', v_record ->> 'revision',
    'reason', 'AUTO_COORDINATED_BURST_BLACKLIST',
    'restrictedWallet', lower(v_invitation.invitee_wallet),
    'coordinatedBurstHub', v_hub
  );
end;
$$;

revoke all on function public.apply_sybil_v2_behavior_pattern_blacklist(
  text, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.apply_sybil_v2_behavior_pattern_blacklist(
  text, bigint, text, text
) to service_role;

comment on function public.apply_sybil_v2_behavior_pattern_blacklist(
  text, bigint, text, text
) is
  'Automatically restricts only an unpaid/unassigned SYSTEM HOLD that simultaneously reproduces synchronized rewards, a >=8-wallet <=30-minute B3TR consolidation burst, a common sink, and that same sink acting as a VeInvite inviter. Allowlisted hubs and operator decisions are never auto-blacklisted.';

commit;
