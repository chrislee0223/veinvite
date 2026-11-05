-- Service-only decision shared by the reserve's source discovery AND
-- transactional SOURCE_SWEEP recheck. If partial elastic pays an early clear
-- winner, an unfinished or unreserved *future* referral must retain its
-- entire possible cohort allocation until fixed or terminal. No Sybil change.
BEGIN;
CREATE OR REPLACE FUNCTION public.reward_elastic_source_has_unsettled_slots_v1(
 p_network text,p_app_id text,p_reward_cohort_round_id bigint,p_receipt_id bigint
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $fn$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_enabled boolean;
 v_rollout timestamptz;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
   OR lower(btrim(coalesce(p_app_id,'')))<>v_app OR p_receipt_id IS NULL
   OR p_reward_cohort_round_id IS NULL
 THEN RAISE EXCEPTION 'ELASTIC_SOURCE_GUARD_SCOPE_INVALID'; END IF;
 SELECT e.enabled AND e.allow_protected_partial_settlement,e.rollout_not_before
 INTO v_enabled,v_rollout
 FROM reward_admission_bridge.elastic_settlement_settings e WHERE e.id=1;
 IF NOT coalesce(v_enabled,false) THEN RETURN false; END IF;
 IF v_rollout IS NULL THEN RAISE EXCEPTION 'ELASTIC_SOURCE_GUARD_EPOCH_MISSING'; END IF;
 RETURN EXISTS (
  SELECT 1 FROM public.invitations i
  WHERE i.activation_network=p_network
    AND i.reward_cohort_round_id=p_reward_cohort_round_id
    AND i.reward_funding_allocation_receipt_id=p_receipt_id
    AND i.activated_at>=v_rollout AND i.status<>'CANCELLED'
    AND NOT EXISTS(SELECT 1 FROM public.reward_queue_entries q
      WHERE q.invite_code=i.invite_code)
    AND NOT EXISTS(SELECT 1 FROM public.reward_payouts p
      WHERE p.invite_code=i.invite_code)
    AND NOT EXISTS(SELECT 1 FROM public.reward_recovery_settlements r
      WHERE r.invite_code=i.invite_code)
 );
END $fn$;
REVOKE ALL ON FUNCTION public.reward_elastic_source_has_unsettled_slots_v1(
 text,text,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reward_elastic_source_has_unsettled_slots_v1(
 text,text,bigint,bigint) TO service_role;
COMMIT;
