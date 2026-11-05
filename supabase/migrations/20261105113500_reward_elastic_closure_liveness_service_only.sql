-- Non-authorizing operational health for elastic Claim reservation.
-- Counts only future, fully Sybil-clear/eligible users whose official
-- closing allocation receipt has aged past configured close grace. Existing
-- older users and unfinished users do not trigger erroneous "late payout".
BEGIN;
CREATE OR REPLACE FUNCTION public.read_reward_elastic_closure_liveness_v1(
 p_network text,p_app_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $fn$
DECLARE
 v_app constant text := '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_ready bigint := 0;
 v_warning bigint := 0;
 v_critical bigint := 0;
 v_oldest timestamptz;
 v_unfinished bigint := 0;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
   OR lower(btrim(coalesce(p_app_id,'')))<>v_app
 THEN RAISE EXCEPTION 'ELASTIC_LIVENESS_BAD_NETWORK_OR_APP'; END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR v_cfg.enabled IS DISTINCT FROM true
 THEN
   RETURN jsonb_build_object('enabled',false,'readyUnreserved',0,
     'warningUnreserved',0,'criticalUnreserved',0,
     'unfinishedInClosedCohorts',0,'oldestEligibleAt',null);
 END IF;
 WITH verified_unfixed AS (
  SELECT i.reward_cohort_round_id cohort, i.reward_funding_allocation_receipt_id receipt_id,
    i.reward_eligible_at eligible_at, min(a.observed_at) official_end
  FROM public.invitations i
  JOIN public.vebetter_round_allocations start_a
    ON start_a.id=i.reward_funding_allocation_receipt_id
   AND start_a.network=p_network AND start_a.app_id=v_app
   AND start_a.vebetter_round_id+1=i.reward_cohort_round_id
  JOIN public.vebetter_round_allocations a
    ON a.network=p_network AND a.app_id=v_app
   AND a.vebetter_round_id=i.reward_cohort_round_id
  WHERE i.activation_network=p_network AND i.status='COMPLETED'
    AND i.sybil_status='CLEAR' AND i.vote_completed
    AND i.reward_status='ELIGIBLE' AND i.reward_eligible_at IS NOT NULL
    AND i.activated_at >= v_cfg.rollout_not_before
    AND NOT EXISTS (SELECT 1 FROM public.reward_queue_entries q
                    WHERE q.invite_code=i.invite_code)
    AND NOT EXISTS (SELECT 1 FROM public.reward_payouts p
                    WHERE p.invite_code=i.invite_code)
    AND NOT EXISTS (SELECT 1 FROM public.reward_recovery_settlements r
                    WHERE r.invite_code=i.invite_code)
    AND NOT EXISTS (SELECT 1 FROM public.invitations old
                    WHERE old.activation_network=p_network
                      AND old.reward_cohort_round_id=i.reward_cohort_round_id
                      AND old.reward_funding_allocation_receipt_id=i.reward_funding_allocation_receipt_id
                      AND old.status<>'CANCELLED'
                      AND (old.activated_at IS NULL
                        OR old.activated_at < v_cfg.rollout_not_before))
  GROUP BY i.invite_code,i.reward_cohort_round_id,
           i.reward_funding_allocation_receipt_id,i.reward_eligible_at
 ),
 past_grace AS (
 SELECT cohort,receipt_id,eligible_at,
        official_end+make_interval(hours=>v_cfg.close_grace_hours) eligible_after
 FROM verified_unfixed
 WHERE official_end+make_interval(hours=>v_cfg.close_grace_hours) <= clock_timestamp()
 )
 SELECT count(*),count(*) FILTER
    (WHERE eligible_after < clock_timestamp()-interval '2 hours'),
   count(*) FILTER
    (WHERE eligible_after < clock_timestamp()-interval '12 hours'),
   min(eligible_at)
 INTO v_ready,v_warning,v_critical,v_oldest
 FROM past_grace;
 WITH closed_cohorts AS (
  SELECT DISTINCT i.reward_cohort_round_id cohort,i.reward_funding_allocation_receipt_id receipt
  FROM public.invitations i
  JOIN public.vebetter_round_allocations a
    ON a.network=p_network AND a.app_id=v_app
   AND a.vebetter_round_id=i.reward_cohort_round_id
   AND a.observed_at<=clock_timestamp()-make_interval(hours=>v_cfg.close_grace_hours)
  WHERE i.activation_network=p_network
    AND i.activated_at>=v_cfg.rollout_not_before
    AND i.status='COMPLETED' AND i.sybil_status='CLEAR'
    AND i.reward_status='ELIGIBLE' AND i.reward_eligible_at IS NOT NULL
 )
 SELECT count(*) INTO v_unfinished
 FROM public.invitations pending
 JOIN closed_cohorts c ON c.cohort=pending.reward_cohort_round_id
   AND c.receipt=pending.reward_funding_allocation_receipt_id
 WHERE pending.activation_network=p_network
   AND pending.status<>'CANCELLED'
   AND NOT (pending.status='COMPLETED' AND pending.sybil_status='CLEAR'
       AND pending.vote_completed AND pending.reward_eligible_at IS NOT NULL);
 RETURN jsonb_build_object('enabled',true,
   'readyUnreserved',v_ready,'warningUnreserved',v_warning,
   'criticalUnreserved',v_critical,
   'unfinishedInClosedCohorts',v_unfinished,
   'oldestEligibleAt',v_oldest);
END $fn$;
REVOKE ALL ON FUNCTION public.read_reward_elastic_closure_liveness_v1(text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_elastic_closure_liveness_v1(text,text)
  TO service_role;
COMMIT;
