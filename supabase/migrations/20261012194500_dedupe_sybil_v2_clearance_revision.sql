-- Stop unchanged SYSTEM assessment revisions from spawning additional CLEAR
-- proofs and reservation wake-ups. Preserves all existing assessment evidence.
-- Exact SQL functions are copied from Production (2026-10-12) with narrow guards.
CREATE OR REPLACE FUNCTION public.record_sybil_v2_assessment(p_invite_code text, p_network text, p_state text, p_risk_score integer, p_policy_version text, p_analyzer_version text, p_evidence_cutoff_block bigint, p_required_checks jsonb, p_completed_checks jsonb, p_reason_codes jsonb, p_evidence_summary jsonb, p_source text DEFAULT 'SYSTEM'::text, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_state text := upper(btrim(p_state));
  v_source text := upper(btrim(p_source));
  v_existing public.sybil_v2_referral_assessments%rowtype;
  v_revision bigint := 1;
  v_now timestamptz := clock_timestamp();
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then raise exception 'INVALID_INVITE_CODE'; end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then raise exception 'INVALID_NETWORK'; end if;
  if v_state not in ('ANALYSIS_PENDING','ANALYSIS_FAILED','CLEAR','WATCH','HOLD','RESTRICTED') then raise exception 'INVALID_SYBIL_V2_STATE'; end if;
  if p_risk_score is null or p_risk_score not between 0 and 100 then raise exception 'INVALID_SYBIL_V2_RISK_SCORE'; end if;
  if nullif(btrim(p_policy_version),'') is null or nullif(btrim(p_analyzer_version),'') is null then raise exception 'INVALID_SYBIL_V2_VERSION'; end if;
  if p_evidence_cutoff_block is not null and p_evidence_cutoff_block < 0 then raise exception 'INVALID_SYBIL_V2_CUTOFF'; end if;
  if jsonb_typeof(coalesce(p_required_checks,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_completed_checks,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_reason_codes,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_evidence_summary,'{}'::jsonb)) <> 'object'
  then
    raise exception 'INVALID_SYBIL_V2_EVIDENCE_SHAPE';
  end if;
  if v_source not in ('SYSTEM','OPERATOR') then raise exception 'INVALID_SYBIL_V2_SOURCE'; end if;

  if not exists (
    select 1 from public.invitations i
    where i.invite_code = v_code
      and i.activation_network = v_network
  ) then
    raise exception 'SYBIL_V2_INVITATION_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_sybil_v2_' || v_code,0));

  select * into v_existing
  from public.sybil_v2_referral_assessments a
  where a.invite_code = v_code
  for update;

  if found then
    -- A refreshed VePassport observation timestamp is not a new security
    -- finding. Keep the current revision/clearance when ALL substantive
    -- evidence, policy, finality and verdict fields still match.
    -- Do not dedupe operator actions: their audit events are intentional.
    if v_source = 'SYSTEM'
       and v_existing.source = 'SYSTEM'
       and v_existing.network = v_network
       and v_existing.state = v_state
       and v_existing.risk_score = p_risk_score
       and v_existing.policy_version = btrim(p_policy_version)
       and v_existing.analyzer_version = btrim(p_analyzer_version)
       and v_existing.evidence_cutoff_block is not distinct from p_evidence_cutoff_block
       and v_existing.required_checks = coalesce(p_required_checks,'[]'::jsonb)
       and v_existing.completed_checks = coalesce(p_completed_checks,'[]'::jsonb)
       and v_existing.reason_codes = coalesce(p_reason_codes,'[]'::jsonb)
       and (v_existing.evidence_summary #- '{vePassport,checkedAt}'::text[])
           = (coalesce(p_evidence_summary,'{}'::jsonb) #- '{vePassport,checkedAt}'::text[])
    then
      return jsonb_build_object(
        'updated', true,
        'unchanged', true,
        'revision', v_existing.revision,
        'state', v_existing.state
      );
    end if;
    if p_expected_revision is not null and p_expected_revision <> v_existing.revision then
      return jsonb_build_object(
        'updated', false,
        'reason', 'STALE_REVISION',
        'revision', v_existing.revision,
        'state', v_existing.state
      );
    end if;
    v_revision := v_existing.revision + 1;

    update public.sybil_v2_referral_assessments
    set
      network = v_network,
      state = v_state,
      risk_score = p_risk_score,
      policy_version = btrim(p_policy_version),
      analyzer_version = btrim(p_analyzer_version),
      revision = v_revision,
      evidence_cutoff_block = p_evidence_cutoff_block,
      required_checks = coalesce(p_required_checks,'[]'::jsonb),
      completed_checks = coalesce(p_completed_checks,'[]'::jsonb),
      reason_codes = coalesce(p_reason_codes,'[]'::jsonb),
      evidence_summary = coalesce(p_evidence_summary,'{}'::jsonb),
      source = v_source,
      assessed_at = v_now,
      updated_at = v_now
    where invite_code = v_code;
  else
    if p_expected_revision is not null and p_expected_revision <> 0 then
      return jsonb_build_object(
        'updated', false,
        'reason', 'STALE_REVISION',
        'revision', 0,
        'state', null
      );
    end if;

    insert into public.sybil_v2_referral_assessments(
      invite_code, network, state, risk_score, policy_version, analyzer_version,
      revision, evidence_cutoff_block, required_checks, completed_checks,
      reason_codes, evidence_summary, source, assessed_at, updated_at
    ) values (
      v_code, v_network, v_state, p_risk_score, btrim(p_policy_version), btrim(p_analyzer_version),
      v_revision, p_evidence_cutoff_block, coalesce(p_required_checks,'[]'::jsonb),
      coalesce(p_completed_checks,'[]'::jsonb), coalesce(p_reason_codes,'[]'::jsonb),
      coalesce(p_evidence_summary,'{}'::jsonb), v_source, v_now, v_now
    );
  end if;

  insert into public.sybil_v2_assessment_events(
    invite_code, network, state, risk_score, policy_version, analyzer_version,
    revision, evidence_cutoff_block, required_checks, completed_checks,
    reason_codes, evidence_summary, source, created_at
  ) values (
    v_code, v_network, v_state, p_risk_score, btrim(p_policy_version), btrim(p_analyzer_version),
    v_revision, p_evidence_cutoff_block, coalesce(p_required_checks,'[]'::jsonb),
    coalesce(p_completed_checks,'[]'::jsonb), coalesce(p_reason_codes,'[]'::jsonb),
    coalesce(p_evidence_summary,'{}'::jsonb), v_source, v_now
  );

  return jsonb_build_object(
    'updated', true,
    'revision', v_revision,
    'state', v_state
  );
end;
$function$;

-- The RPC return is backwards-compatible; callers can distinguish an
-- already-issued clearance from a new clearance without losing the ID.
CREATE OR REPLACE FUNCTION public.issue_sybil_v2_reward_clearance(p_invite_code text, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
      'reused', true,
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
$function$;

comment on function public.record_sybil_v2_assessment(text,text,text,integer,text,text,bigint,jsonb,jsonb,jsonb,jsonb,text,bigint)
is 'Idempotent for semantically unchanged SYSTEM evidence; VePassport checkedAt is observation metadata, not a new assessment revision.';
