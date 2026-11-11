-- Source: reviewed Production function definitions on 2026-11-12.
-- Scope: dynamic collateral sizing only. DO NOT mutate source-protection
-- snapshots, referral states, escrow/ledger, transfers or X obligations.
-- Both canonical closed-cohort settlement and public preview must use the
-- identical helper; update them atomically in one migration.

-- Abort if another task changed either canonical function after review.
-- A failed guard is an intentional fail-closed conflict, not a retry signal.
DO $legacy_source_guard$
BEGIN
  IF coalesce((SELECT md5(pg_get_functiondef(p.oid))
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND p.proname='commit_reward_elastic_closed_cohort_v1'), '')
    <> '07b9047c626fa4a2eed44200b4ed065a'
  OR coalesce((SELECT md5(pg_get_functiondef(p.oid))
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND p.proname='read_reward_elastic_public_scenarios_v1'), '')
    <> 'c1c788d9e7485419fb88eceb76f85147'
  THEN
    RAISE EXCEPTION 'LEGACY_STRESS_SOURCE_DRIFT_REVIEW_REQUIRED';
  END IF;
END;
$legacy_source_guard$;
-- Previously swept source liability/late quotes remain unchanged.
-- Legacy held claims are protected by their CURRENT canonical recipient status,
-- never by an immutable headcount captured at source sweep time.
-- This is a read-only, security-invoker internal calculator, not payout authority.
CREATE OR REPLACE FUNCTION reward_admission_bridge.read_legacy_live_unpaid_stress_wei_v1(
  p_network text,
  p_app_id text,
  p_target_reward_cohort_round_id bigint
)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $legacy_live_stress$
DECLARE
  v_total numeric(78,0);
BEGIN
  IF p_network NOT IN ('mainnet','testnet','testnet-staging')
     OR lower(btrim(coalesce(p_app_id,''))) <>
       '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
     OR p_target_reward_cohort_round_id IS NULL
     OR p_target_reward_cohort_round_id < 1
  THEN
    RAISE EXCEPTION 'LEGACY_STRESS_INVALID_SCOPE';
  END IF;
  SELECT coalesce(sum(p.late_reward_wei * (
    SELECT count(*)::numeric
    FROM public.invitations i
    WHERE i.activation_network = p_network
      AND i.reward_cohort_round_id = p.source_reward_cohort_round_id
      AND i.reward_funding_allocation_receipt_id = p.source_allocation_receipt_id
      -- Do not age out valid users: ALL nonterminal unpaid obligations remain
      -- protected, including completed-but-not-yet-reserved claims.
      AND coalesce(i.status,'') <> 'CANCELLED'
      AND coalesce(i.sybil_status,'') <> 'BLOCKED'
      AND i.reward_paid_at IS NULL
  )),0)
  INTO v_total
  FROM public.reward_boost_reserve_source_protections p
  WHERE p.network = p_network
    AND p.app_id = lower(btrim(p_app_id))
    AND p.source_reward_cohort_round_id < p_target_reward_cohort_round_id;
  IF v_total < 0 OR v_total <> trunc(v_total) THEN
    RAISE EXCEPTION 'LEGACY_STRESS_ACCOUNTING_INVALID';
  END IF;
  RETURN v_total;
END;
$legacy_live_stress$;

-- Internal functions are not publicly callable; callers are the existing
-- privileged closure and read-only preview functions.
REVOKE ALL ON FUNCTION reward_admission_bridge.read_legacy_live_unpaid_stress_wei_v1(text,text,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reward_admission_bridge.read_legacy_live_unpaid_stress_wei_v1(text,text,bigint)
  TO service_role;


-- Preserve all existing grants, signatures, runtime gates and advisory locks.
CREATE OR REPLACE FUNCTION public.commit_reward_elastic_closed_cohort_v1(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_observed_at timestamp with time zone, p_finalized_block bigint, p_legacy_amount_wei numeric, p_basis jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
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
 v_own_contingent numeric(78,0);
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
 -- Never mix a new pricing scheme with older participants in the same
 -- funding cohort. Existing accepted users keep their original quote.
 IF EXISTS(SELECT 1 FROM public.invitations old
    WHERE old.activation_network=p_network
      AND old.reward_cohort_round_id=v_inv.reward_cohort_round_id
      AND old.reward_funding_allocation_receipt_id=v_inv.reward_funding_allocation_receipt_id
      AND old.status<>'CANCELLED'
      AND (old.activated_at IS NULL OR old.activated_at<v_cfg.rollout_not_before)) THEN
   RETURN jsonb_build_object('mode','LEGACY','reason','MIXED_HISTORICAL_COHORT');
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
 count(*) FILTER (WHERE i.status <> 'CANCELLED' AND i.sybil_status <> 'BLOCKED' AND NOT
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
 IF v_valid=0 OR v_unfixed=0 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','NO_UNFIXED_VERIFIED_WINNER');
 END IF;
 -- Default OFF until every external fund mover respects contingent slots.
 IF v_unresolved>0 AND NOT v_cfg.allow_protected_partial_settlement THEN
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
 v_own_contingent:=public.read_reward_elastic_contingent_scope_liability_wei_v1(
   p_network,v_app,v_inv.reward_cohort_round_id,
   v_inv.reward_funding_allocation_receipt_id);
 IF v_own_contingent>v_outstanding THEN
   RAISE EXCEPTION 'ELASTIC_SELF_CONTINGENT_EXCEEDS_GLOBAL';
 END IF;
 -- Protect every CURRENT nonterminal unpaid older cohort recipient. Terminal
  -- canceled, blocked or paid users no longer keep phantom collateral.
  v_source_stress:=reward_admission_bridge.read_legacy_live_unpaid_stress_wei_v1(
    p_network,v_app,v_inv.reward_cohort_round_id);
 v_recent_stress:=public.read_reward_boost_reserve_recent_protected_wei(
   p_network,v_app,v_inv.reward_cohort_round_id);
 v_bank_stress:=public.read_reward_boost_reserve_bank_stress_reserve_wei(
   p_network,v_app);
 v_total_stress:=v_source_stress+v_recent_stress+v_bank_stress;
 v_x_reserve:=(v_valid+v_unresolved)*v_cfg.x_option_reserve_wei;
 v_budget_headroom:=greatest(v_budget-v_committed-v_x_reserve,0);
 -- The global physical reader already protects the entire current cohort.
 -- Release that same cohort's contingent amount ONCE for pricing; the
 -- original canonical signer still sees the full global outstanding.
 v_physical_headroom:=greatest(
   p_observed_pool_balance_wei-v_outstanding+v_own_contingent
   -v_total_stress-v_x_reserve,0);
 v_quote:=floor(least(v_budget_headroom,v_physical_headroom)/(v_unfixed+v_unresolved));
 -- A verified, closed cohort must not fall back to legacy forecast spending
 -- after X-option collateral has been budgeted. Even with many participants
 -- it must reserve all remaining recipients' gross and future X options.
 IF v_quote<v_cfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','BLOCKED',
     'reason','COHORT_X_AND_OLDER_PROTECTION_UNDERFUNDED');
 END IF;
 v_basis:=p_basis || jsonb_build_object(
   'cohortReservedWei',v_committed::text,
   'elasticClosure',jsonb_build_object(
     'policy','elastic-closed-cohort-v1',
     'officialClosureAt',v_closed_at,
     'verifiedRecipients',v_valid,
     'unfixedRecipients',v_unfixed,
     'contingentUnresolvedRecipients',v_unresolved,
     'remainingProtectedSlots',v_unfixed+v_unresolved,
     'ownContingentAlreadyReservedWei',v_own_contingent::text,
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
END $function$;

CREATE OR REPLACE FUNCTION public.read_reward_elastic_public_scenarios_v1(p_network text, p_app_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_alloc public.vebetter_round_allocations%rowtype;
 v_forecast public.reward_forecast_snapshots%rowtype;
 v_cohort bigint;
 v_committed numeric(78,0);
 v_budget numeric(78,0);
 v_outstanding numeric(78,0);
 v_confirmed_unsettled numeric(78,0) := 0;
 v_first_confirmed_at timestamptz;
 v_pre_broadcast_pool numeric(78,0);
 v_old numeric(78,0);
 v_recent numeric(78,0);
 v_bank numeric(78,0);
 v_pool numeric(78,0);
 v_accepted bigint;
 v_one numeric(78,0);
 v_two numeric(78,0);
 v_three numeric(78,0);
 v_physical numeric(78,0);
 v_uncommitted numeric(78,0);
BEGIN
 p_network:=lower(btrim(coalesce(p_network,'')));
 p_app_id:=lower(btrim(coalesce(p_app_id,'')));
 IF p_network NOT IN ('mainnet','testnet','testnet-staging') OR p_app_id<>v_app
 THEN RAISE EXCEPTION 'ELASTIC_PUBLIC_ESTIMATE_SCOPE_INVALID'; END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled THEN RETURN jsonb_build_object('mode','LEGACY'); END IF;
 SELECT * INTO v_alloc FROM public.vebetter_round_allocations a
 WHERE a.network=p_network AND a.app_id=v_app
 ORDER BY a.vebetter_round_id DESC,a.id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','PENDING','reason','ALLOCATION_MISSING'); END IF;
 v_cohort:=v_alloc.vebetter_round_id+1;
 -- Old accepted, noncancelled participants get legacy pricing, never an
 -- inflated hypothetical elastic quote.
 IF EXISTS (SELECT 1 FROM public.invitations i
  WHERE i.activation_network=p_network
    AND i.reward_cohort_round_id=v_cohort
    AND i.reward_funding_allocation_receipt_id=v_alloc.id
    AND i.status<>'CANCELLED'
    AND (i.activated_at IS NULL OR i.activated_at<v_cfg.rollout_not_before))
 THEN RETURN jsonb_build_object('mode','LEGACY','reason','MIXED_HISTORICAL_COHORT'); END IF;
 SELECT * INTO v_forecast FROM public.reward_forecast_snapshots f
 WHERE f.network=p_network AND f.app_id=v_app
 ORDER BY f.generated_at DESC,f.id DESC LIMIT 1;
 IF NOT FOUND OR v_forecast.generated_at<clock_timestamp()-interval '75 minutes'
   OR v_forecast.generated_at>clock_timestamp()+interval '2 minutes'
   OR v_forecast.projected_funding_round_id<>v_cohort THEN
   RETURN jsonb_build_object('mode','PENDING','reason','FRESH_CHAIN_OBSERVATION_REQUIRED');
 END IF;
 v_pool:=v_forecast.observed_pool_balance_wei;
 v_committed:=public.read_reward_cohort_committed_wei(p_network,v_app,v_cohort,v_alloc.id);
 v_budget:=public.read_reward_cohort_effective_budget_wei(p_network,v_app,v_cohort,v_alloc.id);
 v_outstanding:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 -- Display-only correction. Canonical-successful, still-unfinalized B3TR
 -- transfers already reduce the observed on-chain pool, but their immutable
 -- reserved base amount stays in outstanding liabilities until full finality.
 -- Never change the payout/liability authority; eliminate the duplicate
 -- subtraction ONLY after an independent earlier pool snapshot proves that
 -- at least the same amount actually left the physical pool.
 SELECT coalesce(sum(q.reserved_amount_wei),0),min(rr.broadcast_confirmed_at)
 INTO v_confirmed_unsettled,v_first_confirmed_at
 FROM public.reward_queue_entries q
 JOIN public.reward_payouts rp ON rp.invite_code=q.invite_code
   AND rp.round_id=q.assigned_round_id
 JOIN public.reward_rounds rr ON rr.id=rp.round_id
 WHERE q.network=p_network AND q.status='ASSIGNED'
   AND q.reserved_amount_wei IS NOT NULL
   AND rr.network=p_network AND rr.app_id=v_app
   AND rr.broadcast_confirmed_at IS NOT NULL
   AND rr.broadcast_confirmed_at<=v_forecast.generated_at
   AND rp.status IN ('PENDING','SENDING')
   AND rp.amount_wei=q.reserved_amount_wei;
 IF v_confirmed_unsettled>0 THEN
   SELECT f.observed_pool_balance_wei INTO v_pre_broadcast_pool
   FROM public.reward_forecast_snapshots f
   WHERE f.network=p_network AND f.app_id=v_app
     AND f.generated_at<v_first_confirmed_at
   ORDER BY f.generated_at DESC,f.id DESC LIMIT 1;
   IF v_pre_broadcast_pool IS NOT NULL
      AND v_pre_broadcast_pool>=v_pool+v_confirmed_unsettled
      AND v_outstanding>=v_confirmed_unsettled THEN
      v_outstanding:=v_outstanding-v_confirmed_unsettled;
   END IF;
 END IF;
 v_recent:=public.read_reward_boost_reserve_recent_protected_wei(p_network,v_app,v_cohort);
 v_bank:=public.read_reward_boost_reserve_bank_stress_reserve_wei(p_network,v_app);
 v_old:=reward_admission_bridge.read_legacy_live_unpaid_stress_wei_v1(
    p_network,v_app,v_cohort);
 SELECT count(*) INTO v_accepted
 FROM public.invitations i
 WHERE i.activation_network=p_network
   AND i.reward_cohort_round_id=v_cohort
   AND i.reward_funding_allocation_receipt_id=v_alloc.id
   AND i.status<>'CANCELLED';
 IF v_committed<>0 OR v_budget<=0 OR v_pool<=0 OR v_outstanding<0
   OR v_recent<0 OR v_bank<0 OR v_old<0 THEN
   RETURN jsonb_build_object('mode','PENDING','reason','CURRENT_COHORT_ACCOUNTING_NOT_PREVIEWABLE');
 END IF;
 -- Financial capacity already reduced by exact unpaid base/X, unweighted
 -- historical worst-case payouts, recent protected and bank-stress balance.
 v_uncommitted:=greatest(v_budget-v_committed,0);
 v_physical:=greatest(v_pool-v_outstanding-v_old-v_recent-v_bank,0);
 v_one:=floor(least(greatest(v_uncommitted-v_cfg.x_option_reserve_wei,0),
                        greatest(v_physical-v_cfg.x_option_reserve_wei,0)));
 v_two:=floor(least(greatest(v_uncommitted-2*v_cfg.x_option_reserve_wei,0),
                        greatest(v_physical-2*v_cfg.x_option_reserve_wei,0))/2);
 v_three:=floor(least(greatest(v_uncommitted-3*v_cfg.x_option_reserve_wei,0),
                          greatest(v_physical-3*v_cfg.x_option_reserve_wei,0))/3);
 IF v_one<=0 THEN RETURN jsonb_build_object('mode','PENDING','reason','NO_SAFE_ESTIMATED_PAYOUT'); END IF;
 RETURN jsonb_build_object(
  'mode','ELASTIC_SCENARIOS',
  'rewardCohortRoundId',v_cohort,
  'observedAt',v_forecast.generated_at,
  'acceptedParticipants',v_accepted,
  'oneWinnerWei',v_one::text,'twoWinnersWei',v_two::text,'threeWinnersWei',v_three::text,
  'xOptionReservePerWinnerWei',v_cfg.x_option_reserve_wei::text,
  'settlementEarliestHoursAfterOfficialClose',v_cfg.close_grace_hours,
  'finalPayoutNotGuaranteed',true,'writesPerformed',false
 );
END $function$;
