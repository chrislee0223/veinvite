-- Display-only correction for confirmed but not-yet-finalized base payouts.
-- The on-chain reward pool has already decreased, while the immutable
-- reservation remains outstanding until full finality. Count it once for a
-- public estimate only after corroborating the physical balance decrease.
--
-- IMPORTANT: Do not change the real payout/liability authority, X hold,
-- treasury protections, signer, or settlement; no new RPC calls are needed.
-- Mirrors production Supabase migration 20261110161711.
BEGIN;
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
 SELECT coalesce(sum(p.late_reward_wei * greatest(p.long_incomplete_count,
    (SELECT count(*) FROM public.invitations i
      WHERE i.reward_cohort_round_id=p.source_reward_cohort_round_id
        AND i.activation_network=p_network
        AND i.status IN ('ACTIVATING','UNDER_REVIEW')
        AND i.reward_paid_at IS NULL
        AND i.sybil_status<>'BLOCKED'))),0)
 INTO v_old FROM public.reward_boost_reserve_source_protections p
 WHERE p.network=p_network AND p.app_id=v_app
   AND p.source_reward_cohort_round_id<v_cohort;
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
REVOKE ALL ON FUNCTION public.read_reward_elastic_public_scenarios_v1(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_elastic_public_scenarios_v1(text,text) TO service_role;
COMMIT;
