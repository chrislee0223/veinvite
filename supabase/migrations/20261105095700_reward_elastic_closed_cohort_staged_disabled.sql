-- Forward-only elastic settlement through the existing canonical Claim/X/recovery writer.
-- Feature starts DISABLED and only ever applies to referrals activated after rollout.
-- No additional signer and no externally funded top-up; reserve only verified
-- unspent current-cohort budget. Never reprice an existing fixed reservation.
BEGIN;
CREATE TABLE reward_admission_bridge.elastic_settlement_settings (
 id smallint PRIMARY KEY CHECK(id=1),
 enabled boolean NOT NULL DEFAULT false,
 rollout_not_before timestamptz,
 close_grace_hours integer NOT NULL DEFAULT 24 CHECK(close_grace_hours BETWEEN 24 AND 168),
 x_option_reserve_wei numeric(78,0) NOT NULL DEFAULT 10000000000000000000
   CHECK(x_option_reserve_wei>=10000000000000000000),
 min_real_reward_wei numeric(78,0) NOT NULL DEFAULT 1
   CHECK(min_real_reward_wei>0),
 policy_version text NOT NULL DEFAULT 'elastic-closed-cohort-v1'
   CHECK(policy_version='elastic-closed-cohort-v1'),
 CHECK(NOT enabled OR rollout_not_before IS NOT NULL)
);
INSERT INTO reward_admission_bridge.elastic_settlement_settings(id,enabled) VALUES(1,false);
ALTER TABLE reward_admission_bridge.elastic_settlement_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reward_admission_bridge.elastic_settlement_settings FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON reward_admission_bridge.elastic_settlement_settings TO service_role;

-- A service-only database transaction computes the final reward and invokes the
-- *unchanged* canonical reservation writer while the shared network/pool locks
-- remain held. This is NOT an early-at-admission promise or 2nd transfer.
CREATE OR REPLACE FUNCTION public.commit_reward_elastic_closed_cohort_v1(
 p_invite_code text,
 p_network text,
 p_observed_pool_balance_wei numeric,
 p_observed_at timestamptz,
 p_finalized_block bigint,
 p_legacy_amount_wei numeric,
 p_basis jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $fn$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_runtime public.reward_runtime_config%rowtype;
 v_inv public.invitations%rowtype;
 v_closed_at timestamptz;
 v_unresolved bigint;
 v_valid bigint;
 v_unfixed bigint;
 v_committed numeric(78,0);
 v_budget numeric(78,0);
 v_outstanding numeric(78,0);
 v_source_stress numeric(78,0);
 v_recent_stress numeric(78,0);
 v_bank_stress numeric(78,0);
 v_total_stress numeric(78,0);
 v_x_reserve numeric(78,0);
 v_budget_headroom numeric(78,0);
 v_physical_headroom numeric(78,0);
 v_quote numeric(78,0);
 v_basis jsonb;
 v_output jsonb;
BEGIN
 IF p_invite_code IS NULL OR p_invite_code !~ '^[A-Z0-9-]{6,48}$'
   OR p_network NOT IN ('mainnet','testnet','testnet-staging')
   OR p_basis IS NULL OR jsonb_typeof(p_basis)<>'object'
   OR p_legacy_amount_wei IS NULL OR p_legacy_amount_wei<=0
   OR p_legacy_amount_wei<>trunc(p_legacy_amount_wei)
   OR p_observed_pool_balance_wei IS NULL OR p_observed_pool_balance_wei<0
   OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
   OR p_finalized_block IS NULL OR p_finalized_block<1
   OR p_observed_at IS NULL
   OR p_observed_at<clock_timestamp()-interval '120 seconds'
   OR p_observed_at>clock_timestamp()+interval '10 seconds'
 THEN RAISE EXCEPTION 'ELASTIC_CLOSURE_INPUT_INVALID'; END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled THEN
   RETURN jsonb_build_object('mode','LEGACY','reason','ELASTIC_DISABLED');
 END IF;
 -- No parallel early guaranteed HELD and final elastic closure in first rollout.
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.settings WHERE id=1 AND enabled=true) THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','PARALLEL_ADMISSION_AUTHORITY');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
 SELECT * INTO v_runtime FROM public.reward_runtime_config WHERE id=1;
 IF NOT FOUND OR v_runtime.emergency_rewards_paused
   OR (p_network='mainnet' AND NOT v_runtime.mainnet_funded_rewards_enabled) THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','RUNTIME_PAUSED');
 END IF;
 SELECT * INTO v_inv FROM public.invitations
 WHERE invite_code=p_invite_code AND activation_network=p_network
 FOR UPDATE;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','INVITE_NOT_FOUND');
 END IF;
 IF v_inv.activated_at IS NULL OR
    v_inv.activated_at<v_cfg.rollout_not_before THEN
   RETURN jsonb_build_object('mode','LEGACY','reason','PRE_ROLLOUT');
 END IF;
 IF v_inv.status<>'COMPLETED' OR v_inv.sybil_status<>'CLEAR'
   OR v_inv.reward_status<>'ELIGIBLE'
   OR v_inv.reward_eligible_at IS NULL
   OR NOT v_inv.vote_completed
   OR v_inv.reward_cohort_round_id IS NULL
   OR v_inv.reward_funding_allocation_receipt_id IS NULL THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','MISSING_VERIFIED_COMPLETION');
 END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds h
    WHERE h.network=p_network AND h.invite_code=p_invite_code AND h.status='HELD') THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','HELD_ADMISSION_CONFLICT');
 END IF;
 IF EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=p_invite_code)
   OR EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=p_invite_code)
   OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements r WHERE r.invite_code=p_invite_code)
 THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','ALREADY_FIXED');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.vebetter_round_allocations a
    WHERE a.network=p_network AND a.app_id=v_app
      AND a.id=v_inv.reward_funding_allocation_receipt_id
      AND a.vebetter_round_id+1=v_inv.reward_cohort_round_id) THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','INVALID_FUNDING_RECEIPT');
 END IF;
 -- The official allocation receipt for this cohort's END round, observed
 -- for 24-168h, is necessary before closing eligibility.
 SELECT max(a.observed_at) INTO v_closed_at
 FROM public.vebetter_round_allocations a
 WHERE a.network=p_network AND a.app_id=v_app
   AND a.vebetter_round_id=v_inv.reward_cohort_round_id;
 IF v_closed_at IS NULL OR
   clock_timestamp()<v_closed_at+make_interval(hours=>v_cfg.close_grace_hours) THEN
   RETURN jsonb_build_object('mode','DEFER','reason','WAIT_FOR_OFFICIAL_COHORT_CLOSE');
 END IF;
 -- Every known participant must be terminal or fully, independently clear.
 -- Never transfer unfinished/under-review recipients' share to early winners.
 SELECT
 count(*) FILTER (WHERE i.status <> 'CANCELLED' AND NOT
   (i.status='COMPLETED' AND i.sybil_status='CLEAR' AND i.vote_completed
     AND i.reward_eligible_at IS NOT NULL)),
 count(*) FILTER (WHERE i.status='COMPLETED' AND i.sybil_status='CLEAR'
   AND i.vote_completed AND i.reward_eligible_at IS NOT NULL),
 count(*) FILTER (WHERE i.status='COMPLETED' AND i.sybil_status='CLEAR'
   AND i.vote_completed AND i.reward_eligible_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.reward_queue_entries q
     WHERE q.invite_code=i.invite_code)
   AND NOT EXISTS(SELECT 1 FROM public.reward_payouts p
     WHERE p.invite_code=i.invite_code)
   AND NOT EXISTS(SELECT 1 FROM public.reward_recovery_settlements r
     WHERE r.invite_code=i.invite_code))
 INTO v_unresolved,v_valid,v_unfixed
 FROM public.invitations i
 WHERE i.activation_network=p_network
   AND i.reward_cohort_round_id=v_inv.reward_cohort_round_id
   AND i.reward_funding_allocation_receipt_id=v_inv.reward_funding_allocation_receipt_id;
 IF v_unresolved<>0 OR v_valid=0 OR v_unfixed=0 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','UNRESOLVED_OR_EMPTY_RECIPIENT_SET',
     'unresolved',v_unresolved);
 END IF;
 v_committed:=public.read_reward_cohort_committed_wei(
   p_network,v_app,v_inv.reward_cohort_round_id,
   v_inv.reward_funding_allocation_receipt_id);
 v_budget:=public.read_reward_cohort_effective_budget_wei(
   p_network,v_app,v_inv.reward_cohort_round_id,
   v_inv.reward_funding_allocation_receipt_id);
 v_outstanding:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 -- Protect worst-case older incomplete users, not probabilistic weighted
 -- source reserves. Sealed/source counts are intentionally conservative.
 SELECT coalesce(sum(p.late_reward_wei * greatest(p.long_incomplete_count,
    (SELECT count(*) FROM public.invitations i
      WHERE i.reward_cohort_round_id=p.source_reward_cohort_round_id
      AND i.activation_network=p_network
      AND i.status IN ('ACTIVATING','UNDER_REVIEW')
      AND i.reward_paid_at IS NULL
      AND i.sybil_status<>'BLOCKED'))),0)
 INTO v_source_stress
 FROM public.reward_boost_reserve_source_protections p
 WHERE p.network=p_network AND p.app_id=v_app
   AND p.source_reward_cohort_round_id<v_inv.reward_cohort_round_id;
 v_recent_stress:=public.read_reward_boost_reserve_recent_protected_wei(
   p_network,v_app,v_inv.reward_cohort_round_id);
 v_bank_stress:=public.read_reward_boost_reserve_bank_stress_reserve_wei(
   p_network,v_app);
 v_total_stress:=v_source_stress+v_recent_stress+v_bank_stress;
 v_x_reserve:=v_valid*v_cfg.x_option_reserve_wei;
 v_budget_headroom:=greatest(v_budget-v_committed-v_x_reserve,0);
 v_physical_headroom:=greatest(
   p_observed_pool_balance_wei-v_outstanding-v_total_stress-v_x_reserve,0);
 v_quote:=floor(least(v_budget_headroom,v_physical_headroom)/v_unfixed);
 -- Preserve live payout behavior if boost is not provably larger than the
 -- existing reward quote. Never block an ordinary funded eligible Claim.
 IF v_quote<=p_legacy_amount_wei OR v_quote<v_cfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','LEGACY','reason','NO_VERIFIED_BOOST_CAPACITY');
 END IF;
 v_basis:=p_basis || jsonb_build_object(
   'cohortReservedWei',v_committed::text,
   'elasticClosure',jsonb_build_object(
     'policy','elastic-closed-cohort-v1',
     'officialClosureAt',v_closed_at,
     'verifiedRecipients',v_valid,
     'unfixedRecipients',v_unfixed,
     'xOptionProtectedWei',v_x_reserve::text,
     'olderWorstCaseWei',v_total_stress::text,
     'grossQuoteWei',v_quote::text));
 v_output:=public.commit_reward_reservation_with_late_reserve(
   p_invite_code,p_network,p_observed_pool_balance_wei,
   v_outstanding,v_quote,'elastic-closed-cohort-v1',null,
   p_finalized_block,v_basis);
 IF v_output IS NULL OR jsonb_typeof(v_output)<>'object' THEN
   RAISE EXCEPTION 'ELASTIC_CANONICAL_WRITER_MALFORMED';
 END IF;
 RETURN v_output || jsonb_build_object('mode','ELASTIC',
   'elasticGrossWei',v_quote::text,'officialCohort',v_inv.reward_cohort_round_id::text);
END $fn$;

REVOKE ALL ON FUNCTION public.commit_reward_elastic_closed_cohort_v1(
 text,text,numeric,timestamptz,bigint,numeric,jsonb
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_reward_elastic_closed_cohort_v1(
 text,text,numeric,timestamptz,bigint,numeric,jsonb
) TO service_role;
COMMIT;
