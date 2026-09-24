begin;

-- Sybil v2 is the authoritative multi-signal decision layer while enforcement
-- is enabled. Security Client remains an evidence source, but one client-link
-- signal must not independently force a legacy REVIEW/HOLD.
create or replace function public.security_identity_v2_observation_complete(
  p_status text,
  p_checked_at timestamptz,
  p_vote_completed_at timestamptz,
  p_policy_version text,
  p_evidence jsonb
)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $$
  select
    p_policy_version = 'security_client_v2'
    and p_status in (
      'NO_KNOWN_LINK',
      'REVIEW',
      'LINKED_EXISTING',
      'OPERATOR_CLEARED'
    )
    and p_checked_at is not null
    and p_vote_completed_at is not null
    and p_checked_at >= p_vote_completed_at
    and coalesce(p_evidence ->> 'observedClientCount', '') ~ '^[1-9][0-9]*$'
    and (
      p_status <> 'OPERATOR_CLEARED'
      or coalesce(p_evidence ->> 'operatorOverride', 'false') = 'true'
    );
$$;

create or replace function public.enforce_security_client_identity_gate()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_invitee text;
  v_inviter text;
  v_observed_client_count integer := 0;
  v_latest_observed_at timestamptz := null;
  v_related_wallet_count integer := 0;
  v_same_inviter_client boolean := false;
  v_related_participant boolean := false;
  v_related_rewarded boolean := false;
  v_status text := 'UNKNOWN';
  v_score integer := 0;
  v_reason text := 'No VeInvite Security Client observation is available for this wallet yet.';
  v_now timestamptz := clock_timestamp();
  v_evidence jsonb := '{}'::jsonb;
  v_new_operator_override boolean := false;
  v_preserved_operator_override boolean := false;
  v_operator_override boolean := false;
  v_vote_changed boolean := false;
  v_forced_new_evidence boolean := false;
begin
  if new.invitee_wallet is null
     or new.sybil_status <> 'CLEAR' then
    return new;
  end if;

  v_invitee := lower(btrim(new.invitee_wallet));
  v_inviter := lower(btrim(new.inviter_wallet));
  v_forced_new_evidence :=
    coalesce(new.identity_link_evidence ->> 'staleBecause', '') in (
      'NEW_SECURITY_CLIENT_WALLET_MAPPING',
      'RELATED_SECURITY_CLIENT_PARTICIPANT_CHANGED'
    );

  if tg_op = 'UPDATE' then
    v_vote_changed :=
      new.vote_completed_at is distinct from old.vote_completed_at;

    v_new_operator_override :=
      new.sybil_source = 'OPERATOR'
      and (
        new.sybil_status is distinct from old.sybil_status
        or new.sybil_checked_at is distinct from old.sybil_checked_at
        or new.sybil_reason is distinct from old.sybil_reason
        or new.sybil_risk_level is distinct from old.sybil_risk_level
        or new.sybil_risk_score is distinct from old.sybil_risk_score
        or new.sybil_source is distinct from old.sybil_source
      );
  end if;

  with invitee_clients as (
    select distinct o.client_id
    from public.security_client_wallet_observations o
    where o.wallet_address = v_invitee
  ),
  all_client_observations as (
    select o.wallet_address, o.first_seen_at
    from public.security_client_wallet_observations o
    join invitee_clients c on c.client_id = o.client_id
  ),
  related_wallets as (
    select distinct o.wallet_address
    from public.security_client_wallet_observations o
    join invitee_clients c on c.client_id = o.client_id
    where o.wallet_address <> v_invitee
  )
  select
    (select count(*)::integer from invitee_clients),
    (select max(a.first_seen_at) from all_client_observations a),
    (select count(*)::integer from related_wallets),
    coalesce((select bool_or(r.wallet_address = v_inviter) from related_wallets r), false),
    coalesce((
      select bool_or(exists (
        select 1 from public.invitations i
        where lower(btrim(i.invitee_wallet)) = r.wallet_address
          and i.invite_code <> new.invite_code
          and i.eligibility_check_id is not null
          and i.ineligibility_check_id is null
          and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
      )) from related_wallets r
    ), false),
    coalesce((
      select bool_or(exists (
        select 1 from public.invitations i
        where lower(btrim(i.invitee_wallet)) = r.wallet_address
          and i.invite_code <> new.invite_code
          and (i.reward_status in ('ELIGIBLE','PAID') or i.status = 'COMPLETED')
      )) from related_wallets r
    ), false)
  into
    v_observed_client_count,
    v_latest_observed_at,
    v_related_wallet_count,
    v_same_inviter_client,
    v_related_participant,
    v_related_rewarded;

  if tg_op = 'UPDATE' then
    v_preserved_operator_override :=
      old.identity_link_status = 'OPERATOR_CLEARED'
      and old.identity_link_checked_at is not null
      and not v_forced_new_evidence
      and (
        v_latest_observed_at is null
        or v_latest_observed_at <= old.identity_link_checked_at
      );
  end if;

  v_operator_override := v_new_operator_override or v_preserved_operator_override;

  if v_observed_client_count > 0 then
    v_status := 'NO_KNOWN_LINK';
    v_reason := null;
  end if;

  if v_same_inviter_client then
    v_status := 'REVIEW';
    v_score := 90;
    v_reason := 'Invitee and inviter were observed in the same VeInvite security client.';
  elsif v_related_rewarded then
    v_status := 'REVIEW';
    v_score := 80;
    v_reason := 'The invitee shares a VeInvite security client with another completed or rewarded participant wallet.';
  elsif v_related_participant then
    v_status := 'REVIEW';
    v_score := 60;
    v_reason := 'The invitee shares a VeInvite security client with another active participant wallet.';
  end if;

  v_evidence := jsonb_build_object(
    'observedClientCount', v_observed_client_count,
    'latestObservedAt', v_latest_observed_at,
    'relatedWalletCount', v_related_wallet_count,
    'sameInviterClient', v_same_inviter_client,
    'relatedActiveParticipant', v_related_participant,
    'relatedCompletedOrRewardedParticipant', v_related_rewarded,
    'operatorOverride', v_operator_override,
    'signalFamily', 'SECURITY_CLIENT'
  );

  if v_operator_override and v_status in ('UNKNOWN','REVIEW') then
    new.identity_link_status := 'OPERATOR_CLEARED';
  else
    new.identity_link_status := v_status;
  end if;

  new.identity_link_risk_score := v_score;
  new.identity_link_reason := case
    when new.identity_link_status = 'OPERATOR_CLEARED' and v_new_operator_override
      then 'Operator cleared a security-client identity gate: ' || coalesce(v_reason, 'manual review completed')
    when new.identity_link_status = 'OPERATOR_CLEARED' and v_preserved_operator_override
      then old.identity_link_reason
    else v_reason
  end;
  new.identity_link_checked_at := case
    when v_preserved_operator_override and not v_new_operator_override and not v_vote_changed
      then old.identity_link_checked_at
    else v_now
  end;
  new.identity_link_policy_version := 'security_client_v2';
  new.identity_link_evidence := v_evidence;

  -- Legacy/shadow behavior stays unchanged. Once Sybil v2 enforcement is on,
  -- Security Client contributes evidence but does not independently mutate the
  -- referral into legacy REVIEW; the v2 policy combines independent families.
  if v_status = 'REVIEW'
     and not v_operator_override
     and not public.sybil_v2_enforcement_enabled() then
    new.sybil_status := 'REVIEW';
    new.sybil_risk_level := case when v_score >= 80 then 'HIGH' else 'MEDIUM' end;
    new.sybil_risk_score := greatest(coalesce(new.sybil_risk_score,0),v_score);
    new.sybil_reason := v_reason;
    new.sybil_checked_at := v_now;
    new.sybil_source := 'SECURITY_CLIENT';
    if new.status <> 'CANCELLED' then
      new.status := 'UNDER_REVIEW';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_invitation_identity_reward_gate()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_v2_enforced boolean := public.sybil_v2_enforcement_enabled();
  v_has_v2_clearance boolean := false;
begin
  if v_v2_enforced and new.invite_code is not null then
    select exists (
      select 1
      from public.reward_queue_entries q
      join public.sybil_v2_reward_clearances c
        on c.id = q.sybil_clearance_id
       and c.invite_code = q.invite_code
      where q.invite_code = new.invite_code
        and q.sybil_clearance_id is not null
    )
    into v_has_v2_clearance;
  end if;

  if new.reward_status = 'ELIGIBLE' then
    if v_v2_enforced then
      if not public.security_identity_v2_observation_complete(
        new.identity_link_status,
        new.identity_link_checked_at,
        new.vote_completed_at,
        new.identity_link_policy_version,
        new.identity_link_evidence
      ) then
        new.reward_status := 'PENDING';
        new.reward_eligible_at := null;
      end if;
    elsif not public.security_identity_reward_gate_passes(
      new.identity_link_status,
      new.identity_link_checked_at,
      new.vote_completed_at,
      new.identity_link_policy_version,
      new.identity_link_evidence
    ) then
      new.reward_status := 'PENDING';
      new.reward_eligible_at := null;
    end if;
  elsif new.reward_status = 'PAID' then
    if tg_op = 'INSERT' then
      if not (
        v_has_v2_clearance
        or public.security_identity_reward_gate_passes(
          new.identity_link_status,
          new.identity_link_checked_at,
          new.vote_completed_at,
          new.identity_link_policy_version,
          new.identity_link_evidence
        )
      ) then
        raise exception 'PAID_REWARD_IDENTITY_GATE_NOT_SATISFIED';
      end if;
    elsif old.reward_status is distinct from 'PAID'
          and not (
            v_has_v2_clearance
            or public.security_identity_reward_gate_passes(
              new.identity_link_status,
              new.identity_link_checked_at,
              new.vote_completed_at,
              new.identity_link_policy_version,
              new.identity_link_evidence
            )
          ) then
      raise exception 'PAID_REWARD_IDENTITY_GATE_NOT_SATISFIED';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.issue_sybil_v2_reward_clearance(
  p_invite_code text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_existing public.sybil_v2_reward_clearances%rowtype;
  v_clearance public.sybil_v2_reward_clearances%rowtype;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then raise exception 'INVALID_INVITE_CODE'; end if;
  if p_expected_revision is null or p_expected_revision < 1 then raise exception 'INVALID_ASSESSMENT_REVISION'; end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_sybil_v2_' || v_code,0));

  select * into v_existing
  from public.sybil_v2_reward_clearances c
  where c.invite_code = v_code
    and c.assessment_revision = p_expected_revision;

  if found then
    return jsonb_build_object(
      'issued', true,
      'reason', 'ALREADY_ISSUED',
      'clearanceId', v_existing.id,
      'verdict', v_existing.verdict,
      'assessmentRevision', v_existing.assessment_revision
    );
  end if;

  select * into v_assessment
  from public.sybil_v2_referral_assessments a
  where a.invite_code = v_code
  for update;

  if not found then
    return jsonb_build_object('issued',false,'reason','ASSESSMENT_MISSING');
  end if;

  if v_assessment.revision <> p_expected_revision then
    return jsonb_build_object(
      'issued', false,
      'reason', 'STALE_REVISION',
      'assessmentRevision', v_assessment.revision
    );
  end if;

  if v_assessment.state not in ('CLEAR','WATCH') then
    return jsonb_build_object('issued',false,'reason','ASSESSMENT_NOT_CLEAR','state',v_assessment.state);
  end if;

  if not (v_assessment.required_checks <@ v_assessment.completed_checks) then
    return jsonb_build_object('issued',false,'reason','REQUIRED_CHECKS_INCOMPLETE');
  end if;

  if v_assessment.evidence_cutoff_block is null then
    return jsonb_build_object('issued',false,'reason','EVIDENCE_CUTOFF_MISSING');
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code = v_code
  for update;

  if not found
     or v_invitation.status <> 'COMPLETED'
     or v_invitation.reward_status <> 'ELIGIBLE'
     or v_invitation.reward_eligible_at is null
     or v_invitation.sybil_status <> 'CLEAR'
     or v_invitation.sybil_checked_at is null
     or v_invitation.vote_completed is not true
     or v_invitation.vote_completed_block is null
     or v_invitation.inviter_wallet is null
     or v_invitation.invitee_wallet is null
     or v_assessment.evidence_cutoff_block < v_invitation.vote_completed_block
     or not public.security_identity_v2_observation_complete(
       v_invitation.identity_link_status,
       v_invitation.identity_link_checked_at,
       v_invitation.vote_completed_at,
       v_invitation.identity_link_policy_version,
       v_invitation.identity_link_evidence
     )
  then
    return jsonb_build_object('issued',false,'reason','INVITATION_NOT_READY');
  end if;

  if exists (
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network = v_assessment.network
      and r.status = 'ACTIVE'
      and r.wallet_address in (
        lower(v_invitation.inviter_wallet),
        lower(v_invitation.invitee_wallet)
      )
  ) then
    return jsonb_build_object('issued',false,'reason','ACTIVE_WALLET_RESTRICTION');
  end if;

  insert into public.sybil_v2_reward_clearances(
    invite_code, network, verdict, policy_version, analyzer_version,
    assessment_revision, evidence_cutoff_block, risk_score, reason_codes,
    evidence_digest, issued_at
  ) values (
    v_code, v_assessment.network, v_assessment.state, v_assessment.policy_version,
    v_assessment.analyzer_version, v_assessment.revision,
    v_assessment.evidence_cutoff_block, v_assessment.risk_score,
    v_assessment.reason_codes,
    md5(v_assessment.evidence_summary::text),
    clock_timestamp()
  )
  returning * into v_clearance;

  return jsonb_build_object(
    'issued', true,
    'reason', 'ISSUED',
    'clearanceId', v_clearance.id,
    'verdict', v_clearance.verdict,
    'assessmentRevision', v_clearance.assessment_revision
  );
end;
$$;

-- A pre-claim referral HOLD pauses the invitee under review, not the inviter.
-- Inviter-level escalation is handled separately from an individual invitee
-- decision so a legitimate inviter is not punished for one abusive claimant.
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
  and r.state = 'HOLD';

revoke all on public.operator_sybil_v2_temporary_participation_holds
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_temporary_participation_holds
  to service_role;

comment on view public.operator_sybil_v2_temporary_participation_holds is
  'Service-only temporary participation block list. PRE_CLAIM HOLD pauses only the invitee under review; inviter escalation is evaluated separately. POST_PAYOUT HOLD pauses only the already-paid reward recipient. Past rewards are never changed.';

create or replace function public.resolve_sybil_v2_review(
  p_invite_code text,
  p_decision text,
  p_reason text,
  p_expected_revision bigint,
  p_operator_wallet text,
  p_network text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_decision text := upper(btrim(p_decision));
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
  v_operator text := lower(btrim(p_operator_wallet));
  v_network text := lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_record jsonb;
  v_clearance jsonb := null;
  v_revision bigint;
  v_now timestamptz := clock_timestamp();
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if v_decision not in ('CLEAR','BLACKLIST') then
    raise exception 'INVALID_SYBIL_V2_REVIEW_DECISION';
  end if;
  if v_reason is null or length(v_reason) < 12 or length(v_reason) > 500 then
    raise exception 'SYBIL_V2_REVIEW_REASON_LENGTH';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'INVALID_ASSESSMENT_REVISION';
  end if;
  if v_operator !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_OPERATOR_WALLET';
  end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_NETWORK';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_sybil_v2_' || v_code,0));

  select * into v_assessment
  from public.sybil_v2_referral_assessments
  where invite_code = v_code
  for update;

  if not found then raise exception 'SYBIL_V2_ASSESSMENT_NOT_FOUND'; end if;
  if v_assessment.network <> v_network then raise exception 'SYBIL_V2_NETWORK_MISMATCH'; end if;
  if v_assessment.revision <> p_expected_revision then
    raise exception 'SYBIL_V2_REVIEW_STATE_CHANGED';
  end if;
  if v_assessment.state <> 'HOLD' then
    raise exception 'SYBIL_V2_REVIEW_NOT_HOLD';
  end if;

  select * into v_invitation
  from public.invitations
  where invite_code = v_code
  for update;

  if not found or v_invitation.invitee_wallet is null then
    raise exception 'SYBIL_V2_INVITATION_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.reward_queue_entries q
    where q.invite_code = v_code
      and q.sybil_clearance_id is not null
      and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
  ) then
    raise exception 'SYBIL_V2_REVIEW_ALREADY_CLAIM_READY';
  end if;

  perform set_config('veinvite.operator_wallet', v_operator, true);

  if v_decision = 'BLACKLIST' then
    perform public.set_invitation_sybil_decision(
      v_code, 'BLOCKED', 'HIGH', v_reason, 100
    );

    if not exists (
      select 1 from public.sybil_v2_wallet_restrictions r
      where r.network = v_network
        and r.wallet_address = lower(v_invitation.invitee_wallet)
        and r.status = 'ACTIVE'
    ) then
      insert into public.sybil_v2_wallet_restrictions(
        wallet_address, network, status, reason_codes,
        evidence_summary, source, related_invite_code, imposed_at
      ) values (
        lower(v_invitation.invitee_wallet), v_network, 'ACTIVE',
        v_assessment.reason_codes || jsonb_build_array('OPERATOR_BLACKLIST'),
        v_assessment.evidence_summary || jsonb_build_object(
          'operatorReason', v_reason,
          'operatorWallet', v_operator,
          'operatorDecision', 'BLACKLIST',
          'restrictionScope', 'INVITEE_ONLY'
        ),
        'OPERATOR', v_code, v_now
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
      v_assessment.reason_codes || jsonb_build_array('OPERATOR_BLACKLIST'),
      v_assessment.evidence_summary || jsonb_build_object(
        'operatorReason', v_reason,
        'operatorWallet', v_operator,
        'operatorDecision', 'BLACKLIST',
        'restrictionScope', 'INVITEE_ONLY',
        'operatorDecidedAt', v_now
      ),
      'OPERATOR',
      v_assessment.revision
    );

    return jsonb_build_object(
      'changed', true,
      'decision', 'BLACKLIST',
      'state', 'RESTRICTED',
      'assessmentRevision', v_record ->> 'revision',
      'restrictedWallet', lower(v_invitation.invitee_wallet),
      'inviterRestricted', false,
      'clearanceIssued', false
    );
  end if;

  if v_invitation.sybil_status = 'BLOCKED' then
    raise exception 'SYBIL_V2_CANNOT_CLEAR_LEGACY_BLOCK';
  end if;

  if v_invitation.sybil_status = 'REVIEW' then
    perform public.set_invitation_sybil_decision(
      v_code, 'CLEAR', 'NONE', v_reason, 0
    );
  end if;

  v_record := public.record_sybil_v2_assessment(
    v_code,
    v_network,
    'CLEAR',
    0,
    v_assessment.policy_version,
    v_assessment.analyzer_version,
    v_assessment.evidence_cutoff_block,
    v_assessment.required_checks,
    v_assessment.completed_checks,
    v_assessment.reason_codes || jsonb_build_array('OPERATOR_CLEARED'),
    v_assessment.evidence_summary || jsonb_build_object(
      'operatorReason', v_reason,
      'operatorWallet', v_operator,
      'operatorDecision', 'CLEAR',
      'operatorDecidedAt', v_now
    ),
    'OPERATOR',
    v_assessment.revision
  );

  v_revision := nullif(v_record ->> 'revision','')::bigint;
  if v_revision is null then
    raise exception 'SYBIL_V2_OPERATOR_CLEAR_REVISION_MISSING';
  end if;

  v_clearance := public.issue_sybil_v2_reward_clearance(v_code, v_revision);

  return jsonb_build_object(
    'changed', true,
    'decision', 'CLEAR',
    'state', 'CLEAR',
    'assessmentRevision', v_revision,
    'clearanceIssued', coalesce((v_clearance ->> 'issued')::boolean, false),
    'clearanceId', v_clearance ->> 'clearanceId',
    'clearanceReason', v_clearance ->> 'reason'
  );
end;
$$;

revoke all on function public.resolve_sybil_v2_review(
  text,text,text,bigint,text,text
) from public, anon, authenticated;
grant execute on function public.resolve_sybil_v2_review(
  text,text,text,bigint,text,text
) to service_role;

commit;
