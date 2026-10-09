-- Reviewed Production security-client chronology fix (2026-10-09).
-- Aggregate browser observation intervals that overlap are NOT evidence of an
-- immediate wallet switch. Do not update existing Sybil or reward decisions.
-- Executed in Production as version 20261009045715.
begin;

CREATE OR REPLACE FUNCTION public.apply_sybil_v2_security_client_sibling_pattern_restriction(p_invite_code text, p_expected_revision bigint, p_network text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_peer_invite_code text;
  v_peer_wallet text;
  v_shared_client uuid;
  v_common_app_id text;
  v_switch_gap_seconds numeric;
  v_activation_gap_seconds numeric;
  v_peer_activation_gap_seconds numeric;
  v_record jsonb;
  v_now timestamptz := clock_timestamp();
  v_reason text :=
    'Automatic restriction: same-inviter wallets immediately switched on one VeInvite security client and share a synchronized reward-farming pattern on the same dApp.';
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_sybil_v2_sibling_sync_' || v_code,
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

  if public.is_analytics_excluded_wallet(v_invitation.invitee_wallet)
     or public.is_analytics_excluded_wallet(v_invitation.inviter_wallet) then
    return jsonb_build_object(
      'changed', false,
      'state', 'HOLD',
      'revision', v_assessment.revision,
      'reason', 'ANALYTICS_EXCLUDED_WALLET'
    );
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
    peer.invite_code,
    lower(btrim(peer.invitee_wallet)),
    own_obs.client_id,
    common_sync.app_id,
    case
      when peer_obs.first_seen_at > own_obs.last_seen_at then
        extract(epoch from (
          peer_obs.first_seen_at - own_obs.last_seen_at
        ))
      when own_obs.first_seen_at > peer_obs.last_seen_at then
        extract(epoch from (
          own_obs.first_seen_at - peer_obs.last_seen_at
        ))
      else null
    end,
    abs(extract(epoch from (
      v_invitation.activated_at - own_obs.first_seen_at
    ))),
    abs(extract(epoch from (
      peer.activated_at - peer_obs.first_seen_at
    )))
  into
    v_peer_invite_code,
    v_peer_wallet,
    v_shared_client,
    v_common_app_id,
    v_switch_gap_seconds,
    v_activation_gap_seconds,
    v_peer_activation_gap_seconds
  from public.security_client_wallet_observations own_obs
  join public.security_client_wallet_observations peer_obs
    on peer_obs.client_id = own_obs.client_id
   and lower(btrim(peer_obs.wallet_address)) <>
       lower(btrim(own_obs.wallet_address))
  join public.invitations peer
    on peer.invitee_wallet is not null
   and lower(btrim(peer.invitee_wallet)) =
       lower(btrim(peer_obs.wallet_address))
   and lower(btrim(peer.inviter_wallet)) =
       lower(btrim(v_invitation.inviter_wallet))
   and peer.invite_code <> v_code
   and peer.activated_at is not null
  join lateral (
    select subject_sync.app_id
    from public.sybil_v2_evidence_records subject_sync
    join public.sybil_v2_evidence_records peer_sync
      on peer_sync.app_id = subject_sync.app_id
     and peer_sync.invite_code = peer.invite_code
     and peer_sync.signal_code =
         'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER'
     and peer_sync.strength = 'HIGH'
     and peer_sync.score > 0
     and peer_sync.analyzer_version =
         v_assessment.analyzer_version
    where subject_sync.invite_code = v_code
      and subject_sync.signal_code =
          'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER'
      and subject_sync.strength = 'HIGH'
      and subject_sync.score > 0
      and subject_sync.app_id is not null
      and subject_sync.analyzer_version =
          v_assessment.analyzer_version
    order by
      greatest(
        subject_sync.score,
        peer_sync.score
      ) desc,
      subject_sync.app_id
    limit 1
  ) common_sync on true
  where lower(btrim(own_obs.wallet_address)) =
        lower(btrim(v_invitation.invitee_wallet))
    and not public.is_analytics_excluded_wallet(peer.invitee_wallet)
    and (
      case
        when peer_obs.first_seen_at > own_obs.last_seen_at then
          extract(epoch from (
            peer_obs.first_seen_at - own_obs.last_seen_at
          ))
        when own_obs.first_seen_at > peer_obs.last_seen_at then
          extract(epoch from (
            own_obs.first_seen_at - peer_obs.last_seen_at
          ))
        else null
      end
    ) <= 600
    and abs(extract(epoch from (
      v_invitation.activated_at - own_obs.first_seen_at
    ))) <= 600
    and abs(extract(epoch from (
      peer.activated_at - peer_obs.first_seen_at
    ))) <= 600
  order by
    (
      case
        when peer_obs.first_seen_at > own_obs.last_seen_at then
          peer_obs.first_seen_at - own_obs.last_seen_at
        when own_obs.first_seen_at > peer_obs.last_seen_at then
          own_obs.first_seen_at - peer_obs.last_seen_at
        else null
      end
    ) asc
  limit 1;

  if v_shared_client is null
     or v_peer_invite_code is null
     or v_common_app_id is null then
    return jsonb_build_object(
      'changed', false,
      'state', 'HOLD',
      'revision', v_assessment.revision,
      'reason', 'SIBLING_SYNC_PATTERN_NOT_CONFIRMED'
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
      and r.wallet_address =
          lower(btrim(v_invitation.invitee_wallet))
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
      lower(btrim(v_invitation.invitee_wallet)),
      v_network,
      'ACTIVE',
      coalesce(v_assessment.reason_codes, '[]'::jsonb)
        || jsonb_build_array(
          'AUTO_SECURITY_CLIENT_SIBLING_SYNC_REWARD_RESTRICTION'
        ),
      coalesce(v_assessment.evidence_summary, '{}'::jsonb)
        || jsonb_build_object(
          'automaticDecision', 'RESTRICT',
          'behaviorPattern',
            'SECURITY_CLIENT_SIBLING_SYNC_REWARD_V1',
          'peerInviteCode', v_peer_invite_code,
          'peerWallet', v_peer_wallet,
          'sharedClientId', v_shared_client,
          'commonSynchronizedRewardAppId', v_common_app_id,
          'switchGapSeconds', v_switch_gap_seconds,
          'activationGapSeconds', v_activation_gap_seconds,
          'peerActivationGapSeconds',
            v_peer_activation_gap_seconds,
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
    coalesce(v_assessment.reason_codes, '[]'::jsonb)
      || jsonb_build_array(
        'AUTO_SECURITY_CLIENT_SIBLING_SYNC_REWARD_RESTRICTION'
      ),
    coalesce(v_assessment.evidence_summary, '{}'::jsonb)
      || jsonb_build_object(
        'automaticDecision', 'RESTRICT',
        'behaviorPattern',
          'SECURITY_CLIENT_SIBLING_SYNC_REWARD_V1',
        'peerInviteCode', v_peer_invite_code,
        'peerWallet', v_peer_wallet,
        'sharedClientId', v_shared_client,
        'commonSynchronizedRewardAppId', v_common_app_id,
        'switchGapSeconds', v_switch_gap_seconds,
        'activationGapSeconds', v_activation_gap_seconds,
        'peerActivationGapSeconds',
          v_peer_activation_gap_seconds,
        'automaticDecidedAt', v_now
      ),
    'SYSTEM',
    v_assessment.revision
  );

  return jsonb_build_object(
    'changed', true,
    'state', 'RESTRICTED',
    'revision', v_record ->> 'revision',
    'reason',
      'AUTO_SECURITY_CLIENT_SIBLING_SYNC_REWARD_RESTRICTION',
    'restrictedWallet',
      lower(btrim(v_invitation.invitee_wallet)),
    'peerInviteCode', v_peer_invite_code,
    'peerWallet', v_peer_wallet,
    'sharedClientId', v_shared_client,
    'commonSynchronizedRewardAppId', v_common_app_id,
    'switchGapSeconds', v_switch_gap_seconds
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_security_client_sibling_inviter_cluster()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_current record;
  v_peer record;
  v_parent record;
  v_switch_gap_seconds numeric;
  v_current_activation_gap_seconds numeric;
  v_peer_activation_gap_seconds numeric;
  v_now timestamptz := clock_timestamp();
begin
  if public.is_analytics_excluded_wallet(new.wallet_address) then
    return new;
  end if;

  select
    i.invite_code,
    lower(btrim(i.inviter_wallet)) as inviter_wallet,
    lower(btrim(i.invitee_wallet)) as invitee_wallet,
    i.activated_at
  into v_current
  from public.invitations i
  where i.invitee_wallet is not null
    and lower(btrim(i.invitee_wallet)) = lower(btrim(new.wallet_address))
    and i.eligibility_check_id is not null
    and i.ineligibility_check_id is null
    and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
    and i.sybil_status <> 'BLOCKED'
    and i.reward_status <> 'PAID'
    and i.activated_at is not null
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = i.invite_code
        and q.status = 'ASSIGNED'
        and q.assigned_round_id is not null
    )
  order by i.activated_at desc nulls last, i.created_at desc
  limit 1;

  if not found
     or public.is_analytics_excluded_wallet(v_current.inviter_wallet) then
    return new;
  end if;

  for v_peer in
    select
      i.invite_code,
      lower(btrim(i.invitee_wallet)) as invitee_wallet,
      i.activated_at,
      o.first_seen_at,
      o.last_seen_at
    from public.security_client_wallet_observations o
    join public.invitations i
      on lower(btrim(i.invitee_wallet)) = lower(btrim(o.wallet_address))
    where o.client_id = new.client_id
      and lower(btrim(o.wallet_address)) <> lower(btrim(new.wallet_address))
      and lower(btrim(i.inviter_wallet)) = v_current.inviter_wallet
      and i.eligibility_check_id is not null
      and i.ineligibility_check_id is null
      and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
      and i.sybil_status <> 'BLOCKED'
      and i.reward_status <> 'PAID'
      and i.activated_at is not null
      and not public.is_analytics_excluded_wallet(i.invitee_wallet)
      and not exists (
        select 1
        from public.reward_queue_entries q
        where q.invite_code = i.invite_code
          and q.status = 'ASSIGNED'
          and q.assigned_round_id is not null
      )
    order by o.first_seen_at asc
  loop
    if new.first_seen_at > v_peer.last_seen_at then
      v_switch_gap_seconds :=
        extract(epoch from (new.first_seen_at - v_peer.last_seen_at));
    elsif v_peer.first_seen_at > new.last_seen_at then
      v_switch_gap_seconds :=
        extract(epoch from (v_peer.first_seen_at - new.last_seen_at));
    else
      v_switch_gap_seconds := null;
    end if;

    v_current_activation_gap_seconds :=
      abs(extract(epoch from (v_current.activated_at - new.first_seen_at)));
    v_peer_activation_gap_seconds :=
      abs(extract(epoch from (v_peer.activated_at - v_peer.first_seen_at)));

    if v_switch_gap_seconds <= 600
       and v_current_activation_gap_seconds <= 600
       and v_peer_activation_gap_seconds <= 600 then

      select
        p.invite_code,
        p.identity_link_status,
        p.identity_link_risk_score,
        p.vote_completed_at
      into v_parent
      from public.invitations p
      where p.invitee_wallet is not null
        and lower(btrim(p.invitee_wallet)) = v_current.inviter_wallet
        and p.eligibility_check_id is not null
        and p.ineligibility_check_id is null
        and p.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
        and p.sybil_status <> 'BLOCKED'
        and p.reward_status <> 'PAID'
        and not public.is_analytics_excluded_wallet(p.invitee_wallet)
        and not exists (
          select 1
          from public.reward_queue_entries q
          where q.invite_code = p.invite_code
            and q.status = 'ASSIGNED'
            and q.assigned_round_id is not null
        )
      order by p.activated_at desc nulls last, p.created_at desc
      limit 1;

      if found then
        update public.invitations p
        set
          identity_link_status = case
            when p.identity_link_status = 'LINKED_EXISTING'
              then p.identity_link_status
            else 'REVIEW'
          end,
          identity_link_risk_score =
            greatest(coalesce(p.identity_link_risk_score,0),70),
          identity_link_reason = case
            when p.identity_link_status = 'LINKED_EXISTING'
              then p.identity_link_reason
            else
              'Two downstream invitees from this wallet immediately switched wallets on the same VeInvite security client.'
          end,
          identity_link_checked_at = v_now,
          identity_link_policy_version = 'security_client_v2',
          identity_link_evidence =
            coalesce(p.identity_link_evidence,'{}'::jsonb)
            || jsonb_build_object(
              'downstreamSameClientSibling', true,
              'sharedClientId', new.client_id,
              'downstreamInviteCodes',
                jsonb_build_array(v_current.invite_code,v_peer.invite_code),
              'downstreamWallets',
                jsonb_build_array(v_current.invitee_wallet,v_peer.invitee_wallet),
              'immediateSwitch', true,
              'switchGapSeconds', v_switch_gap_seconds,
              'downstreamActivationGapSeconds',
                v_current_activation_gap_seconds,
              'peerActivationGapSeconds',
                v_peer_activation_gap_seconds,
              'preVoteDetection', case
                when v_parent.vote_completed_at is null then null
                else greatest(new.first_seen_at, v_peer.first_seen_at) <= v_parent.vote_completed_at
              end,
              'signalFamily', 'CLUSTER_LINK',
              'detectedAt', v_now
            )
        where p.invite_code = v_parent.invite_code;
      end if;

      exit;
    end if;
  end loop;

  return new;
end;
$function$
;

commit;
