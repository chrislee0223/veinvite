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
  v_burst jsonb;
  v_start_block bigint;
  v_end_block bigint;
  v_wallet_count integer := 0;
  v_max_gap bigint := 0;
  v_sync boolean := false;
  v_mission boolean := false;
  v_funding boolean := false;
  v_identity boolean := false;
  v_restricted_peers integer := 0;
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
    hashtextextended('veinvite_sybil_v2_behavior_pattern_' || v_code, 0)
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

  select e.evidence
  into v_burst
  from public.sybil_v2_evidence_records e
  where e.invite_code = v_code
    and e.network = v_network
    and e.subject_wallet = lower(v_invitation.invitee_wallet)
    and e.signal_code = 'HISTORICAL_DENSE_B3TR_BURST'
    and e.strength = 'HIGH'
    and e.score > 0
    and lower(e.related_wallet) = v_hub
  order by e.score desc, e.created_at desc
  limit 1;

  if v_burst is null then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'DENSE_BURST_EVIDENCE_MISSING'
    );
  end if;

  begin
    v_start_block := nullif(v_burst ->> 'burstStartBlock','')::bigint;
    v_end_block := nullif(v_burst ->> 'burstEndBlock','')::bigint;
  exception when others then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'DENSE_BURST_EVIDENCE_INVALID'
    );
  end;

  if v_start_block is null
     or v_end_block is null
     or v_end_block < v_start_block
     or v_end_block - v_start_block > 180 then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'DENSE_BURST_WINDOW_INVALID'
    );
  end if;

  with wallet_points as (
    select
      lower(o.wallet_address) as wallet_address,
      min(o.block_number)::bigint as block_number
    from public.sybil_v2_preactivation_b3tr_outflows o
    where o.network = v_network
      and lower(o.destination_wallet) = v_hub
      and o.block_number between v_start_block and v_end_block
    group by lower(o.wallet_address)
  ),
  ordered as (
    select
      wallet_address,
      block_number,
      lag(block_number) over (order by block_number, wallet_address) as previous_block
    from wallet_points
  )
  select
    count(*)::integer,
    coalesce(max(block_number - previous_block), 0)::bigint
  into
    v_wallet_count,
    v_max_gap
  from ordered;

  if v_wallet_count < 6
     or v_max_gap > 24
     or not exists (
       select 1
       from public.sybil_v2_preactivation_b3tr_outflows o
       where o.network = v_network
         and lower(o.wallet_address) = lower(v_invitation.invitee_wallet)
         and lower(o.destination_wallet) = v_hub
         and o.block_number between v_start_block and v_end_block
     ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'DENSE_BURST_RUNTIME_VERIFICATION_FAILED'
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
      and e.signal_code = 'SECURITY_CLIENT_INVITER_LINK'
      and e.strength = 'HIGH'
      and e.score > 0
  ) into v_identity;

  select count(distinct r.wallet_address)::integer
  into v_restricted_peers
  from public.sybil_v2_wallet_restrictions r
  where r.network = v_network
    and r.status = 'ACTIVE'
    and r.wallet_address <> lower(v_invitation.invitee_wallet)
    and (
      r.reason_codes @> '["AUTO_BEHAVIOR_PATTERN_BLACKLIST"]'::jsonb
      or r.reason_codes @> '["OPERATOR_BLACKLIST"]'::jsonb
    )
    and exists (
      select 1
      from public.sybil_v2_preactivation_b3tr_outflows o
      where o.network = v_network
        and lower(o.wallet_address) = r.wallet_address
        and lower(o.destination_wallet) = v_hub
        and o.block_number between v_start_block and v_end_block
    );

  if v_sync then
    v_corroboration := 'SYNCHRONIZED_REWARD';
  elsif v_mission and v_funding then
    v_corroboration := 'MISSION_AND_FUNDING';
  elsif v_identity then
    v_corroboration := 'SECURITY_IDENTITY';
  elsif v_restricted_peers >= 3 then
    v_corroboration := 'RESTRICTED_BURST_PEERS';
  else
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'INSUFFICIENT_INDEPENDENT_CORROBORATION',
      'burstWalletCount', v_wallet_count,
      'restrictedBurstPeers', v_restricted_peers
    );
  end if;

  v_reason :=
    'Automatic blacklist: dense coordinated B3TR consolidation burst reproduced with independent corroborating Sybil evidence.';

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
        || jsonb_build_array('AUTO_BEHAVIOR_PATTERN_BLACKLIST'),
      v_assessment.evidence_summary
        || jsonb_build_object(
          'automaticDecision', 'BLACKLIST',
          'behaviorPattern', 'DENSE_B3TR_BURST_WITH_CORROBORATION_V1',
          'behaviorPatternHub', v_hub,
          'burstStartBlock', v_start_block,
          'burstEndBlock', v_end_block,
          'burstWalletCount', v_wallet_count,
          'burstMaxGapBlocks', v_max_gap,
          'corroboration', v_corroboration,
          'restrictedBurstPeers', v_restricted_peers,
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
      || jsonb_build_array('AUTO_BEHAVIOR_PATTERN_BLACKLIST'),
    v_assessment.evidence_summary
      || jsonb_build_object(
        'automaticDecision', 'BLACKLIST',
        'behaviorPattern', 'DENSE_B3TR_BURST_WITH_CORROBORATION_V1',
        'behaviorPatternHub', v_hub,
        'burstStartBlock', v_start_block,
        'burstEndBlock', v_end_block,
        'burstWalletCount', v_wallet_count,
        'burstMaxGapBlocks', v_max_gap,
        'corroboration', v_corroboration,
        'restrictedBurstPeers', v_restricted_peers,
        'automaticDecidedAt', v_now
      ),
    'SYSTEM',
    v_assessment.revision
  );

  return jsonb_build_object(
    'changed', true,
    'state', 'RESTRICTED',
    'revision', v_record ->> 'revision',
    'reason', 'AUTO_BEHAVIOR_PATTERN_BLACKLIST',
    'restrictedWallet', lower(v_invitation.invitee_wallet),
    'behaviorPatternHub', v_hub,
    'corroboration', v_corroboration
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
  'Automatically restricts only a current SYSTEM HOLD participating in a runtime-verified dense B3TR consolidation burst (6+ wallets, <=180 blocks, <=24-block max gap) when independently corroborated by synchronized rewards, mission+funding evidence, strong security identity evidence, or at least three already-restricted peers in the same burst. A dense sink alone never auto-blacklists, allowlisted hubs are excluded, operator decisions are untouched, and paid/assigned rewards are frozen.';

commit;
