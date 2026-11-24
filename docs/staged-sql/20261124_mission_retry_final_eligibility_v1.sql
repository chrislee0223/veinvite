-- STAGED: final retry admission, not a new payout mechanism. Apply only
-- together with the checked canonical financial/identity adapters.
BEGIN;
CREATE OR REPLACE FUNCTION public.mission_retry_assessment_is_current_v1(
 p_invite_code text,p_network text,p_revision bigint
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $fresh$
 SELECT EXISTS (
  SELECT 1 FROM public.invitations i
  JOIN reward_admission_bridge.mission_retry_attempts_v1 a
    ON a.invitation_id=i.id AND a.network=i.activation_network AND a.state='ACTIVE'
  JOIN reward_admission_bridge.mission_retry_settlement_bindings_v1 b
    ON b.attempt_id=a.id AND b.invitation_id=i.id AND b.network=a.network
  JOIN public.sybil_v2_referral_assessments s ON s.invite_code=i.invite_code AND s.network=a.network
  JOIN reward_admission_bridge.mission_retry_attempt_events_v1 v ON v.id=b.completion_event_id
    AND v.attempt_id=a.id AND v.event_type='ALLOCATION_VOTE'
  WHERE i.invite_code=p_invite_code AND i.activation_network=p_network
    AND s.revision=p_revision AND s.state='CLEAR'
    AND s.evidence_cutoff_block>=b.completion_block
    AND s.assessed_at>=v.block_timestamp
    AND s.evidence_summary->>'missionRetryAttemptNo'=a.attempt_no::text
    AND s.evidence_summary->>'missionRetryCompletionBlock'=b.completion_block::text
    AND '["HISTORICAL_CHAIN","FUNDING_CHAIN","MISSION_BEHAVIOR","SECURITY_IDENTITY","VEPASSPORT","CHAIN_FINALITY"]'::jsonb
       <@ s.completed_checks
    AND s.required_checks<@s.completed_checks
    AND i.vote_completed IS TRUE AND i.vote_round_id=b.completion_round_id
    AND i.vote_completed_block=b.completion_block AND i.vote_completed_at=v.block_timestamp
    AND i.impact_sync_complete_at IS NOT NULL
    AND i.sybil_status NOT IN ('REVIEW','BLOCKED')
    AND i.ineligible_at IS NULL AND i.slot_released_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.sybil_v2_wallet_restrictions k
     WHERE k.network=p_network AND k.status='ACTIVE'
       AND k.wallet_address IN(lower(i.inviter_wallet),lower(i.invitee_wallet)))
 );
$fresh$;
REVOKE ALL ON FUNCTION public.mission_retry_assessment_is_current_v1(text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mission_retry_assessment_is_current_v1(text,text,bigint) TO service_role;

-- The existing trigger remains the independent final guard. Direct updates
-- cannot turn an old/incomplete assessment into eligibility.
CREATE OR REPLACE FUNCTION public.guard_legacy_mission_auto_reset_promotion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $guard$
DECLARE revision bigint;
BEGIN
 IF (new.status IS DISTINCT FROM old.status OR new.reward_status IS DISTINCT FROM old.reward_status)
  AND (new.status='COMPLETED' OR new.reward_status='ELIGIBLE')
  AND EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a
    WHERE a.invitation_id=new.id AND a.network=new.activation_network)
 THEN
   SELECT s.revision INTO revision FROM public.sybil_v2_referral_assessments s
   WHERE s.invite_code=new.invite_code AND s.network=new.activation_network;
   IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1 WHERE id=1 AND enabled)
    OR NOT public.sybil_v2_enforcement_enabled()
    OR NOT public.mission_retry_assessment_is_current_v1(new.invite_code,new.activation_network,revision)
    OR new.status IS DISTINCT FROM 'COMPLETED' OR new.reward_status IS DISTINCT FROM 'ELIGIBLE'
    OR new.sybil_status IS DISTINCT FROM 'CLEAR'
    OR NOT coalesce(public.security_identity_v2_observation_complete(new.identity_link_status,
      new.identity_link_checked_at,new.vote_completed_at,new.identity_link_policy_version,
      new.identity_link_evidence),false)
   THEN RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_PAYOUT_NOT_ENABLED'; END IF;
 END IF;
 RETURN new;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.authorize_mission_retry_eligibility_v1(
 p_network text,p_invite_code text,p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $authorize$
DECLARE i public.invitations%rowtype; s public.sybil_v2_referral_assessments%rowtype;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1 WHERE id=1 AND enabled)
  OR NOT public.sybil_v2_enforcement_enabled()
 THEN RETURN jsonb_build_object('eligible',false,'reason','FEATURE_DISABLED'); END IF;

 -- Same lock ordering as existing assessment and clearance functions.
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_sybil_v2_'||p_invite_code,0));
 SELECT * INTO s FROM public.sybil_v2_referral_assessments
 WHERE invite_code=p_invite_code AND network=p_network FOR UPDATE;
 IF NOT FOUND OR s.revision IS DISTINCT FROM p_expected_revision THEN
  RETURN jsonb_build_object('eligible',false,'reason','STALE_ASSESSMENT'); END IF;
 SELECT * INTO i FROM public.invitations WHERE invite_code=p_invite_code
   AND activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason','MISSING'); END IF;
 IF NOT public.mission_retry_assessment_is_current_v1(p_invite_code,p_network,s.revision)
 THEN RETURN jsonb_build_object('eligible',false,'reason','CURRENT_CLEAR_ASSESSMENT_REQUIRED'); END IF;
 IF i.status='COMPLETED' AND i.reward_status='ELIGIBLE' THEN
  RETURN jsonb_build_object('eligible',true,'reused',true); END IF;
 IF i.status IS DISTINCT FROM 'ACTIVATING' OR i.reward_status IS DISTINCT FROM 'PENDING'
   OR i.sybil_status NOT IN ('NOT_CHECKED','CLEAR')
   OR EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=i.invite_code)
   OR EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=i.invite_code)
   OR EXISTS(SELECT 1 FROM reward_admission_bridge.holds h WHERE h.network=p_network
       AND h.invite_code=i.invite_code AND h.status='HELD')
 THEN RETURN jsonb_build_object('eligible',false,'reason','INVITATION_PROTECTED'); END IF;

 -- Existing BEFORE triggers recompute identity and prove exact execution order.
 -- A failed eligibility/identity gate rolls the entire statement back.
 BEGIN
  UPDATE public.invitations SET status='COMPLETED',sybil_status='CLEAR',
    sybil_checked_at=clock_timestamp(),sybil_source='SYSTEM',
    sybil_risk_level='NONE',sybil_risk_score=s.risk_score,sybil_reason=NULL
  WHERE id=i.id RETURNING * INTO i;
  IF i.status IS DISTINCT FROM 'COMPLETED' OR i.reward_status IS DISTINCT FROM 'ELIGIBLE'
   OR i.sybil_status IS DISTINCT FROM 'CLEAR' OR i.reward_eligible_at IS NULL
  THEN RAISE EXCEPTION 'RETRY_EXISTING_ELIGIBILITY_GATE_REJECTED'; END IF;
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM IN ('MISSION_RETRY_CANONICAL_PAYOUT_NOT_ENABLED','RETRY_EXISTING_ELIGIBILITY_GATE_REJECTED')
  THEN RETURN jsonb_build_object('eligible',false,'reason','IDENTITY_OR_ELIGIBILITY_PENDING'); END IF;
  RAISE;
 END;
 RETURN jsonb_build_object('eligible',true,'reused',false);
END;
$authorize$;
REVOKE ALL ON FUNCTION public.authorize_mission_retry_eligibility_v1(text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_mission_retry_eligibility_v1(text,text,bigint) TO service_role;
COMMIT;
