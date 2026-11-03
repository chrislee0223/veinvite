-- STAGE 0 ONLY: prepare a real-production-schema read bridge for future
-- admission guarantees. There is NO writer, no live promise and no changes
-- to Claim, payout, reserve sweeps, funding budgets or live runtime switches.
-- Feature is mechanically impossible to enable in this migration.
BEGIN;

CREATE SCHEMA IF NOT EXISTS reward_admission_bridge;
REVOKE ALL ON SCHEMA reward_admission_bridge FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA reward_admission_bridge TO service_role;

CREATE TABLE reward_admission_bridge.settings (
  id smallint PRIMARY KEY CHECK(id=1),
  enabled boolean NOT NULL DEFAULT false CHECK(enabled=false),
  policy_version text NOT NULL DEFAULT 'staged-disabled-v1'
    CHECK(policy_version='staged-disabled-v1'),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO reward_admission_bridge.settings(id,enabled,policy_version)
VALUES(1,false,'staged-disabled-v1')
ON CONFLICT(id) DO NOTHING;

-- Read-only foundation; no service-role INSERT/UPDATE/DELETE privileges.
-- Not an authorization source for base reward, X promotion or Claim until
-- all existing liability readers and writers are atomically integrated.
CREATE TABLE reward_admission_bridge.holds (
  network text NOT NULL CHECK(network IN ('mainnet','testnet','testnet-staging')),
  invite_code text NOT NULL,
  app_id text NOT NULL
    CHECK(app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'),
  reward_cohort_round_id bigint NOT NULL CHECK(reward_cohort_round_id>0),
  funding_allocation_receipt_id bigint NOT NULL CHECK(funding_allocation_receipt_id>0),
  amount_wei numeric(78,0) NOT NULL CHECK(amount_wei>0 AND amount_wei=trunc(amount_wei)),
  status text NOT NULL CHECK(status IN ('HELD','CONVERTED','RELEASED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(network,invite_code)
);
CREATE INDEX reward_admission_bridge_held_by_cohort_idx
  ON reward_admission_bridge.holds
  (network,app_id,reward_cohort_round_id,funding_allocation_receipt_id)
  WHERE status='HELD';

ALTER TABLE reward_admission_bridge.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_admission_bridge.holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA reward_admission_bridge FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON reward_admission_bridge.settings TO service_role;
GRANT SELECT ON reward_admission_bridge.holds TO service_role;

CREATE OR REPLACE FUNCTION public.read_reward_admission_bridge_status_v1(
  p_network text,
  p_app_id text,
  p_reward_cohort_round_id bigint,
  p_allocation_receipt_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_network text:=lower(btrim(coalesce(p_network,'')));
  v_app text:=lower(btrim(coalesce(p_app_id,'')));
  v_app_const constant text:=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_receipt public.vebetter_round_allocations%rowtype;
  v_glob numeric(78,0):=0;
  v_cohort_hold numeric(78,0):=0;
  v_existing numeric(78,0):=0;
  v_existing_x numeric(78,0):=0;
  v_lifetime numeric(78,0):=0;
  v_budget numeric(78,0):=0;
  v_holds_count bigint:=0;
  v_disabled boolean;
BEGIN
  IF v_network NOT IN ('mainnet','testnet','testnet-staging') OR
     v_app<>v_app_const OR
     p_reward_cohort_round_id IS NULL OR p_reward_cohort_round_id<1 OR
     p_allocation_receipt_id IS NULL OR p_allocation_receipt_id<1 THEN
    RAISE EXCEPTION 'REWARD_ADMISSION_BRIDGE_INVALID_SCOPE';
  END IF;
  SELECT * INTO v_receipt FROM public.vebetter_round_allocations
  WHERE id=p_allocation_receipt_id AND network=v_network AND app_id=v_app
    AND veBetter_round_id+1=p_reward_cohort_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REWARD_ADMISSION_BRIDGE_ALLOCATION_MISMATCH';
  END IF;

  SELECT NOT enabled INTO v_disabled FROM reward_admission_bridge.settings WHERE id=1;
  IF NOT FOUND OR v_disabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'REWARD_ADMISSION_BRIDGE_STAGING_GATE_VIOLATED';
  END IF;

  -- Physical base/X outstanding is ALREADY a single authoritative number.
  -- X RESERVED/HELD must NEVER be added to it a second time.
  v_existing:=public.read_outstanding_reward_liability(v_network,v_app)::numeric;
  v_existing_x:=public.read_reward_x_promotion_post_base_liability_wei(v_network,v_app);
  v_lifetime:=public.read_reward_cohort_committed_wei(
    v_network,v_app,p_reward_cohort_round_id,p_allocation_receipt_id);
  v_budget:=public.read_reward_cohort_effective_budget_wei(
    v_network,v_app,p_reward_cohort_round_id,p_allocation_receipt_id);

  SELECT coalesce(sum(amount_wei),0),count(*) INTO v_glob,v_holds_count
  FROM reward_admission_bridge.holds
  WHERE network=v_network AND app_id=v_app AND status='HELD';

  SELECT coalesce(sum(amount_wei),0) INTO v_cohort_hold
  FROM reward_admission_bridge.holds
  WHERE network=v_network AND app_id=v_app AND status='HELD'
    AND reward_cohort_round_id=p_reward_cohort_round_id
    AND funding_allocation_receipt_id=p_allocation_receipt_id;

  IF v_existing<0 OR v_existing_x<0 OR v_existing_x>v_existing OR
     v_lifetime<0 OR v_budget<0 OR v_glob<0 OR v_cohort_hold<0 OR
     v_cohort_hold>v_glob THEN
    RAISE EXCEPTION 'REWARD_ADMISSION_BRIDGE_LEDGER_INVALID';
  END IF;

  RETURN jsonb_build_object(
    'model','staged-disabled-v1',
    'enabled',false,
    'canAdmit',false,
    'canGuarantee',false,
    'canSign',false,
    'authorizesWrite',false,
    'requiresAtomicHandoff',true,
    'requiresXAndRecoveryReconciliation',true,
    'requiresUncoveredLegacyStressProof',true,
    'network',v_network,
    'appId',v_app,
    'rewardCohortRoundId',p_reward_cohort_round_id::text,
    'allocationReceiptId',p_allocation_receipt_id::text,
    'physicalBaseAndXOutstandingWei',v_existing::text,
    'xLiveUnpaidAlreadyIncludedWei',v_existing_x::text,
    'unconvertedGlobalHoldsWei',v_glob::text,
    'unconvertedCohortHoldsWei',v_cohort_hold::text,
    'existingCohortLifetimeCommittedWei',v_lifetime::text,
    'cohortEffectiveBudgetWei',v_budget::text,
    'cohortLifetimePlusHoldsWei',(v_lifetime+v_cohort_hold)::text,
    'globalHoldsCount',v_holds_count,
    'globalLiabilityIncludingHoldsWei',(v_existing+v_glob)::text,
    'accountingConsistent',v_lifetime+v_cohort_hold<=v_budget
  );
END $fn$;

REVOKE ALL ON FUNCTION public.read_reward_admission_bridge_status_v1(
  text,text,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_admission_bridge_status_v1(
  text,text,bigint,bigint) TO service_role;
COMMENT ON FUNCTION public.read_reward_admission_bridge_status_v1(
  text,text,bigint,bigint)
IS 'Service-only staged/disarmed real-accounting bridge. READ ONLY. No minimum guarantee and no payout authority.';
COMMIT;