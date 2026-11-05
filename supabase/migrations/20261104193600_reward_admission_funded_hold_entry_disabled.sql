-- Staged production-capable referral admission. HARD-DISABLED.
-- Does not modify reward_admission_bridge.settings or its CHECK(enabled=false).
-- No B3TR, claims or new guarantees can be created while disabled.
-- Completes the service entry half paired with private HELD->fixed handoff.
-- Financial policy, Sybil cancellation and wallet-backed finality must be
-- audited before a separate future activation migration could open this.
BEGIN;
CREATE OR REPLACE FUNCTION reward_admission_bridge.reserve_funded_held_v1(
 p_invite_code text,
 p_network text,
 p_amount_wei numeric,
 p_observed_pool_wei numeric,
 p_expected_physical_wei numeric,
 p_expected_cohort_wei numeric,
 p_stress_reserve_wei numeric,
 p_finalized_block bigint,
 p_observed_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $fn$
DECLARE
 v_code text:=upper(btrim(coalesce(p_invite_code,'')));
 v_net text:=lower(btrim(coalesce(p_network,'')));
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_enabled boolean;
 v_inv public.invitations%rowtype;
 v_exists reward_admission_bridge.holds%rowtype;
 v_physical numeric(78,0);
 v_cohort numeric(78,0);
 v_budget numeric(78,0);
BEGIN
 IF v_code !~ '^[A-Z0-9-]{6,48}$'
    OR v_net NOT IN ('mainnet','testnet','testnet-staging')
    OR p_amount_wei IS NULL OR p_amount_wei<=0 OR p_amount_wei<>trunc(p_amount_wei)
    OR p_observed_pool_wei IS NULL OR p_observed_pool_wei<0
    OR p_observed_pool_wei<>trunc(p_observed_pool_wei)
    OR p_expected_physical_wei IS NULL OR p_expected_physical_wei<0
    OR p_expected_physical_wei<>trunc(p_expected_physical_wei)
    OR p_expected_cohort_wei IS NULL OR p_expected_cohort_wei<0
    OR p_expected_cohort_wei<>trunc(p_expected_cohort_wei)
    OR p_stress_reserve_wei IS NULL OR p_stress_reserve_wei<0
    OR p_stress_reserve_wei<>trunc(p_stress_reserve_wei)
    OR p_finalized_block IS NULL OR p_finalized_block<1
    OR p_observed_at IS NULL
    OR p_observed_at < clock_timestamp()-interval '120 seconds'
    OR p_observed_at > clock_timestamp()+interval '10 seconds'
 THEN RAISE EXCEPTION 'ADMISSION_HOLD_INPUT_INVALID'; END IF;

 SELECT enabled INTO v_enabled FROM reward_admission_bridge.settings WHERE id=1;
 IF NOT FOUND OR v_enabled IS DISTINCT FROM true THEN
   RETURN jsonb_build_object('admitted',false,'reason','ADMISSION_HOLD_DISABLED');
 END IF;

 -- Same canonical order as the existing reward reservation and handoff RPC.
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||v_net,0));

 SELECT * INTO v_inv FROM public.invitations
 WHERE invite_code=v_code AND activation_network=v_net FOR UPDATE;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('admitted',false,'reason','INVITE_NOT_FOUND');
 END IF;
 IF v_inv.status NOT IN ('ACTIVATING','UNDER_REVIEW')
    OR v_inv.sybil_status NOT IN ('NOT_CHECKED','CLEAR')
    OR v_inv.activated_at IS NULL
    OR v_inv.activation_block IS NULL
    OR v_inv.activation_block>p_finalized_block
    OR v_inv.eligibility_check_id IS NULL
    OR v_inv.ineligible_at IS NOT NULL
    OR v_inv.slot_released_at IS NOT NULL
    OR v_inv.reward_eligible_at IS NOT NULL
 THEN RETURN jsonb_build_object('admitted',false,'reason','INELIGIBLE_OR_RESTRICTED'); END IF;

 IF v_inv.reward_cohort_round_id IS NULL
    OR v_inv.reward_funding_allocation_receipt_id IS NULL
    OR NOT EXISTS(
      SELECT 1 FROM public.vebetter_round_allocations a
      WHERE a.id=v_inv.reward_funding_allocation_receipt_id
        AND a.network=v_net AND a.app_id=v_app
        AND a.vebetter_round_id+1=v_inv.reward_cohort_round_id
    )
 THEN RETURN jsonb_build_object('admitted',false,'reason','UNFUNDED_COHORT'); END IF;

 SELECT * INTO v_exists FROM reward_admission_bridge.holds h
 WHERE h.network=v_net AND h.invite_code=v_code FOR UPDATE;
 IF FOUND THEN
   RETURN jsonb_build_object('admitted',false,'reason','HOLD_ALREADY_EXISTS');
 END IF;
 IF EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=v_code)
 OR EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=v_code)
 OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements s WHERE s.invite_code=v_code)
 THEN RETURN jsonb_build_object('admitted',false,'reason','REWARD_ALREADY_FIXED'); END IF;

 v_physical:=public.read_outstanding_reward_liability(v_net,v_app)::numeric;
 v_cohort:=public.read_reward_cohort_committed_wei(
   v_net,v_app,v_inv.reward_cohort_round_id,v_inv.reward_funding_allocation_receipt_id);
 v_budget:=public.read_reward_cohort_effective_budget_wei(
   v_net,v_app,v_inv.reward_cohort_round_id,v_inv.reward_funding_allocation_receipt_id);
 IF v_physical<>p_expected_physical_wei OR v_cohort<>p_expected_cohort_wei THEN
   RETURN jsonb_build_object('admitted',false,'reason','RECALCULATE');
 END IF;
 IF v_physical<0 OR v_cohort<0 OR v_budget<0 OR v_cohort>v_budget
    OR v_physical+p_amount_wei+p_stress_reserve_wei>p_observed_pool_wei
    OR v_cohort+p_amount_wei>v_budget THEN
   RETURN jsonb_build_object('admitted',false,'reason','UNDERFUNDED');
 END IF;
 INSERT INTO reward_admission_bridge.holds(
   network,invite_code,app_id,reward_cohort_round_id,
   funding_allocation_receipt_id,amount_wei,status
 ) VALUES (
   v_net,v_code,v_app,v_inv.reward_cohort_round_id,
   v_inv.reward_funding_allocation_receipt_id,p_amount_wei,'HELD'
 );
 IF public.read_outstanding_reward_liability(v_net,v_app)::numeric
      <>v_physical+p_amount_wei
    OR public.read_reward_cohort_committed_wei(
      v_net,v_app,v_inv.reward_cohort_round_id,
      v_inv.reward_funding_allocation_receipt_id)
      <>v_cohort+p_amount_wei
 THEN RAISE EXCEPTION 'ADMISSION_POST_COMMIT_LEDGER_DRIFT'; END IF;
 RETURN jsonb_build_object(
   'admitted',true,'reason','HELD',
   'cohort',v_inv.reward_cohort_round_id::text,
   'guaranteedWei',p_amount_wei::text
 );
END $fn$;
REVOKE ALL ON FUNCTION reward_admission_bridge.reserve_funded_held_v1(
 text,text,numeric,numeric,numeric,numeric,numeric,bigint,timestamptz
) FROM PUBLIC,anon,authenticated,service_role;

-- PostgREST-exposed but SERVICE ROLE ONLY. Private writer carries financial
-- locks, freshness validation, budget caps, Sybil/receipt and replay checks.
CREATE OR REPLACE FUNCTION public.create_reward_admission_hold_v1(
 p_invite_code text,p_network text,p_amount_wei numeric,
 p_observed_pool_wei numeric,p_expected_physical_wei numeric,
 p_expected_cohort_wei numeric,p_stress_reserve_wei numeric,
 p_finalized_block bigint,p_observed_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $entry$
BEGIN
 RETURN reward_admission_bridge.reserve_funded_held_v1(
  p_invite_code,p_network,p_amount_wei,p_observed_pool_wei,
  p_expected_physical_wei,p_expected_cohort_wei,p_stress_reserve_wei,
  p_finalized_block,p_observed_at);
END $entry$;

REVOKE ALL ON FUNCTION public.create_reward_admission_hold_v1(
 text,text,numeric,numeric,numeric,numeric,numeric,bigint,timestamptz)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_reward_admission_hold_v1(
 text,text,numeric,numeric,numeric,numeric,numeric,bigint,timestamptz)
 TO service_role;

COMMIT;
