-- Prepare an independent future-only policy guard INSIDE the private admission writer.
-- Staged and hard-disabled: does not enable admission, sign, pay, release or
-- alter any existing reward. Actual opt-in remains CHECK(enabled=false).
-- All new fields default to NULL and block any accidental future enablement
-- until a separately reviewed and funded rollout policy is provided.
BEGIN;
ALTER TABLE reward_admission_bridge.settings
 ADD COLUMN IF NOT EXISTS rollout_not_before timestamptz,
 ADD COLUMN IF NOT EXISTS guarantee_minimum_wei numeric(78,0),
 ADD COLUMN IF NOT EXISTS stress_reserve_floor_wei numeric(78,0);
ALTER TABLE reward_admission_bridge.settings
 ADD CONSTRAINT settings_future_rollout_policy_check
 CHECK (enabled=false OR
   (rollout_not_before IS NOT NULL
    AND guarantee_minimum_wei>0
    AND guarantee_minimum_wei=trunc(guarantee_minimum_wei)
    AND stress_reserve_floor_wei>0
    AND stress_reserve_floor_wei=trunc(stress_reserve_floor_wei)));
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
 v_rollout timestamptz;
 v_minimum numeric(78,0);
 v_stress_floor numeric(78,0);
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

 SELECT enabled,rollout_not_before,guarantee_minimum_wei,stress_reserve_floor_wei
 INTO v_enabled,v_rollout,v_minimum,v_stress_floor
 FROM reward_admission_bridge.settings WHERE id=1;
 IF NOT FOUND OR v_enabled IS DISTINCT FROM true THEN
   RETURN jsonb_build_object('admitted',false,'reason','ADMISSION_HOLD_DISABLED');
 END IF;
 -- Independent DB-side opt-in: do not trust the browser or server environment
 -- alone for the epoch, floor or collateral. Defaults are NULL (fail closed).
 IF v_rollout IS NULL OR v_rollout>clock_timestamp()
    OR v_minimum IS NULL OR v_minimum<=0
    OR v_stress_floor IS NULL OR v_stress_floor<=0
    OR p_amount_wei<>v_minimum OR p_stress_reserve_wei<v_stress_floor
 THEN
   RETURN jsonb_build_object('admitted',false,'reason','ADMISSION_POLICY_NOT_READY');
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
 -- Even a privileged future call cannot give a retroactive HELD promise.
 IF v_inv.activated_at<v_rollout THEN
   RETURN jsonb_build_object('admitted',false,'reason','PRE_ROLLOUT_INVITE');
 END IF;

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
-- Preserve service-only wrapper and strict private-function privilege isolation.
REVOKE ALL ON FUNCTION reward_admission_bridge.reserve_funded_held_v1(
 text,text,numeric,numeric,numeric,numeric,numeric,bigint,timestamptz
) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
