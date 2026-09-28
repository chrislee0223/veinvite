begin;

-- Newly confirmed malicious historical hubs are knowledge updates. For any
-- unpaid/unassigned referral, the exact previously reviewed signature may be
-- enforced even when the hub was confirmed after the referral activated.
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

  v_reason :=
    'Automatic blacklist: exact operator-confirmed historical Sybil cluster signature reproduced.';

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
  'Promotes an unpaid/unassigned SYSTEM HOLD when it reproduces the exact operator-confirmed synchronized-reward/common-sink/inviter signature. Confirmation time is knowledge time, so older unpaid referrals are reassessed; hub linkage alone, paid rewards, assigned payouts, allowlisted hubs, and operator decisions are protected.';

-- High-confidence historical loop:
-- one wallet funds first VTHO for at least three wallets and each funded wallet
-- sends B3TR back to that same wallet within 12 blocks. This is much narrower
-- than ordinary shared funding or a common sink.
create or replace function public.apply_sybil_v2_funder_return_loop_restriction(
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
  v_loop_wallets integer := 0;
  v_max_return_blocks bigint := 0;
  v_subject_is_spoke boolean := false;
  v_subject_is_hub boolean := false;
  v_evidence_present boolean := false;
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
    hashtextextended('veinvite_sybil_v2_funder_return_' || v_code, 0)
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

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.subject_wallet = lower(v_invitation.invitee_wallet)
      and e.signal_code in (
        'HISTORICAL_FUNDER_RETURN_LOOP',
        'HISTORICAL_FUNDER_RETURN_LOOP_HUB'
      )
      and e.strength = 'HIGH'
      and e.score > 0
      and lower(e.related_wallet) = v_hub
  )
  into v_evidence_present;

  if not v_evidence_present then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'FUNDER_RETURN_LOOP_EVIDENCE_MISSING'
    );
  end if;

  with funding as (
    select
      lower(e.subject_wallet) as wallet_address,
      min(e.observed_block)::bigint as funding_block
    from public.sybil_v2_evidence_records e
    where e.network = v_network
      and e.evidence_family = 'FUNDING'
      and e.signal_code = 'FIRST_VTHO_FUNDER'
      and lower(e.related_wallet) = v_hub
      and e.observed_block is not null
    group by lower(e.subject_wallet)
  ),
  loops as (
    select
      f.wallet_address,
      f.funding_block,
      min(o.block_number)::bigint as return_block
    from funding f
    join public.sybil_v2_preactivation_b3tr_outflows o
      on o.network = v_network
     and lower(o.wallet_address) = f.wallet_address
     and lower(o.destination_wallet) = v_hub
     and o.block_number between f.funding_block and f.funding_block + 12
    group by f.wallet_address, f.funding_block
  )
  select
    count(*)::integer,
    coalesce(max(return_block - funding_block), 0)::bigint,
    coalesce(bool_or(wallet_address = lower(v_invitation.invitee_wallet)), false)
  into
    v_loop_wallets,
    v_max_return_blocks,
    v_subject_is_spoke
  from loops;

  v_subject_is_hub :=
    lower(v_invitation.invitee_wallet) = v_hub;

  if v_loop_wallets < 3
     or v_max_return_blocks > 12
     or not (v_subject_is_spoke or v_subject_is_hub) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'FUNDER_RETURN_LOOP_RUNTIME_VERIFICATION_FAILED',
      'loopWalletCount', v_loop_wallets,
      'maxReturnBlocks', v_max_return_blocks
    );
  end if;

  v_reason :=
    'Automatic restriction: coordinated first-VTHO funding followed by rapid B3TR return to the same hub.';

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
        || jsonb_build_array('AUTO_FUNDER_RETURN_LOOP_RESTRICTION'),
      v_assessment.evidence_summary
        || jsonb_build_object(
          'automaticDecision', 'RESTRICT',
          'behaviorPattern', 'FUNDER_RETURN_LOOP_V1',
          'behaviorPatternHub', v_hub,
          'loopWalletCount', v_loop_wallets,
          'maxReturnBlocks', v_max_return_blocks,
          'subjectRole', case when v_subject_is_hub then 'HUB' else 'SPOKE' end,
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
      || jsonb_build_array('AUTO_FUNDER_RETURN_LOOP_RESTRICTION'),
    v_assessment.evidence_summary
      || jsonb_build_object(
        'automaticDecision', 'RESTRICT',
        'behaviorPattern', 'FUNDER_RETURN_LOOP_V1',
        'behaviorPatternHub', v_hub,
        'loopWalletCount', v_loop_wallets,
        'maxReturnBlocks', v_max_return_blocks,
        'subjectRole', case when v_subject_is_hub then 'HUB' else 'SPOKE' end,
        'automaticDecidedAt', v_now
      ),
    'SYSTEM',
    v_assessment.revision
  );

  return jsonb_build_object(
    'changed', true,
    'state', 'RESTRICTED',
    'revision', v_record ->> 'revision',
    'reason', 'AUTO_FUNDER_RETURN_LOOP_RESTRICTION',
    'restrictedWallet', lower(v_invitation.invitee_wallet),
    'behaviorPatternHub', v_hub,
    'loopWalletCount', v_loop_wallets,
    'maxReturnBlocks', v_max_return_blocks
  );
end;
$$;

revoke all on function public.apply_sybil_v2_funder_return_loop_restriction(
  text, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.apply_sybil_v2_funder_return_loop_restriction(
  text, bigint, text, text
) to service_role;

comment on function public.apply_sybil_v2_funder_return_loop_restriction(
  text, bigint, text, text
) is
  'Restricts only an unpaid/unassigned SYSTEM HOLD when runtime verification confirms a high-confidence funder-return loop: one wallet is the first VTHO funder for at least three wallets and those wallets return B3TR to that same wallet within 12 blocks. The hub itself may also be restricted when it participates in VeInvite.';

commit;
