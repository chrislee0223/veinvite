begin;

-- Follow-up: an independent global reserved 10 B3TR (X promotion etc.)
-- is protected in physical headroom and must not prevent a current cohort
-- with zero fixed payouts from receiving its single permitted top-up.
CREATE OR REPLACE FUNCTION public.seal_and_topup_current_reward_cohort(p_network text, p_app_id text, p_observed_pool_balance_wei numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_alloc public.vebetter_round_allocations%rowtype;
  v_existing public.reward_boost_current_topup_plans%rowtype;
  v_destination public.reward_boost_reserve_destination_plans%rowtype;
  v_plan public.reward_boost_current_topup_plans%rowtype;
  v_forecast public.reward_forecast_snapshots%rowtype;
  v_cohort bigint;
  v_committed numeric(78,0);
  v_reserved numeric(78,0);
  v_remaining numeric(78,0);
  v_bank numeric(78,0);
  v_stress numeric(78,0);
  v_source_retained numeric(78,0);
  v_recent_protected numeric(78,0);
  v_headroom numeric(78,0);
  v_amount numeric(78,0);
  v_ledger_id bigint;
  v_reference_key text;
  v_planning jsonb;
begin
  p_network:=lower(btrim(p_network));
  p_app_id:=lower(btrim(p_app_id));
  if p_network not in ('mainnet','testnet','testnet-staging')
     or p_app_id !~ '^0x[0-9a-f]{64}$'
     or p_observed_pool_balance_wei is null
     or p_observed_pool_balance_wei<0
     or p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei) then
    raise exception 'INVALID_REWARD_CURRENT_TOPUP_INPUT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
  perform pg_advisory_xact_lock(hashtextextended('veinvite_reward_boost_reserve_'||p_network||'_'||p_app_id,0));
  select * into v_cfg from public.reward_runtime_config where id=1 for update;
  if not found
     or not v_cfg.reward_boost_reserve_enabled
     or not v_cfg.reward_boost_reserve_adaptive_v2_enabled
     or v_cfg.emergency_rewards_paused
     or (p_network='mainnet' and not v_cfg.mainnet_funded_rewards_enabled) then
    raise exception 'REWARD_CURRENT_TOPUP_GATED_OFF';
  end if;
  select * into v_alloc from public.vebetter_round_allocations a
  where a.network=p_network and a.app_id=p_app_id
  order by a.vebetter_round_id desc,a.id desc limit 1;
  if not found then
    return jsonb_build_object('changed',false,'reason','NO_ACTIVE_ALLOCATION');
  end if;
  v_cohort:=v_alloc.vebetter_round_id+1;
  if v_cfg.reward_boost_current_topup_target_round_id is distinct from v_cohort then
    return jsonb_build_object('changed',false,'reason','COHORT_NOT_EXPLICITLY_APPROVED',
      'cohort',v_cohort);
  end if;
  select * into v_existing from public.reward_boost_current_topup_plans t
  where t.network=p_network and t.app_id=p_app_id
    and t.reward_cohort_round_id=v_cohort and t.allocation_receipt_id=v_alloc.id;
  if found then
    return jsonb_build_object('changed',false,'reason','ALREADY_TOPPED_UP',
      'cohort',v_cohort,'amountWei',v_existing.amount_wei::text,'planId',v_existing.id);
  end if;
  select * into v_destination from public.reward_boost_reserve_destination_plans d
  where d.network=p_network and d.app_id=p_app_id
    and d.destination_reward_cohort_round_id=v_cohort and d.destination_allocation_receipt_id=v_alloc.id;
  if not found or v_destination.policy_version<>'reward-boost-reserve-v2-adaptive' then
    return jsonb_build_object('changed',false,'reason','NO_ADAPTIVE_DESTINATION_PLAN');
  end if;
  select * into v_forecast from public.reward_forecast_snapshots f
  where f.network=p_network and f.app_id=p_app_id
  order by f.generated_at desc,f.id desc limit 1;
  if not found
    or v_forecast.generated_at is null
    or v_forecast.generated_at < now() - interval '30 minutes'
    or v_forecast.observed_pool_balance_wei is distinct from p_observed_pool_balance_wei
    or (v_forecast.input_snapshot->>'rewardCohortRoundId') is distinct from v_cohort::text then
    return jsonb_build_object('changed',false,'reason','CURRENT_POOL_SNAPSHOT_REQUIRED');
  end if;
  v_committed:=public.read_reward_cohort_committed_wei(p_network,p_app_id,v_cohort,v_alloc.id);
  v_planning:=public.read_reward_cohort_planning_snapshot(p_network,p_app_id,v_cohort,v_alloc.id);
  if (v_planning->>'reservedExistingWei') is null then
    raise exception 'REWARD_CURRENT_TOPUP_RESERVATION_SNAPSHOT_MISSING';
  end if;
  v_reserved:=(v_planning->>'reservedExistingWei')::numeric;
  -- Never reprice a cohort with existing fixed claims or outstanding queue reservations.
  -- reservedExistingWei is global pool protection, e.g. outstanding X promotion.
  -- Its entire value is subtracted from physical headroom below. It does not
  -- represent a fixed claim against THIS funding cohort.
  if v_reserved is null or v_reserved < 0 then
    raise exception 'REWARD_CURRENT_TOPUP_GLOBAL_RESERVE_INVALID';
  end if;
  -- Only current-cohort fixed commitments prohibit same-round repricing.
  if v_committed<>0 then
    return jsonb_build_object('changed',false,'reason','COHORT_ALREADY_HAS_RESERVATIONS');
  end if;
  v_remaining:=public.read_reward_cohort_effective_budget_wei(p_network,p_app_id,v_cohort,v_alloc.id);
  v_bank:=public.read_reward_boost_reserve_balance_wei(p_network,p_app_id);
  v_stress:=public.read_reward_boost_reserve_bank_stress_reserve_wei(p_network,p_app_id);
  v_source_retained:=public.read_reward_boost_reserve_source_retained_wei(p_network,p_app_id);
  v_recent_protected:=public.read_reward_boost_reserve_recent_protected_wei(p_network,p_app_id,v_cohort);
  v_headroom:=greatest(
    p_observed_pool_balance_wei-v_reserved-v_remaining-v_recent_protected-v_source_retained-v_stress,
    0
  );
  -- The bank stress reserve is untouchable. Add no more than one fresh allocation.
  v_amount:=least(
    greatest(v_bank-v_stress,0),
    v_headroom,
    greatest(v_alloc.rewards_allocation_amount_wei,0)
  );
  if v_amount<=0 then
    return jsonb_build_object('changed',false,'reason','NO_SAFE_TOPUP_CAPACITY',
      'bankWei',v_bank::text,'stressWei',v_stress::text,'headroomWei',v_headroom::text);
  end if;
  insert into public.reward_boost_current_topup_plans(
    network,app_id,reward_cohort_round_id,allocation_receipt_id,
    destination_plan_id,amount_wei,bank_balance_before_wei,bank_stress_reserve_wei,
    source_retained_wei,recent_protected_wei,observed_pool_wei,global_reserved_wei,forecast_snapshot_id
  ) values (
    p_network,p_app_id,v_cohort,v_alloc.id,v_destination.id,v_amount,v_bank,v_stress,
    v_source_retained,v_recent_protected,p_observed_pool_balance_wei,v_reserved,v_forecast.id
  ) returning * into v_plan;
  v_reference_key:='boost-current-topup:'||v_alloc.id::text||':'||v_plan.id::text;
  insert into public.reward_boost_reserve_ledger(
    network,app_id,entry_kind,destination_reward_cohort_round_id,
    destination_allocation_receipt_id,amount_wei,policy_version,reference_key,details
  ) values (
    p_network,p_app_id,'BOOST_RELEASE',v_cohort,v_alloc.id,v_amount,v_plan.policy_version,v_reference_key,
    jsonb_build_object(
      'currentCohortTopupPlanId',v_plan.id,
      'originalDestinationPlanId',v_destination.id,
      'bankStressReserveWei',v_stress::text,
      'sourceRetainedWei',v_source_retained::text,
      'recentProtectedWei',v_recent_protected::text,
      'physicalHeadroomWei',v_headroom::text,
      'freshAllocationCapWei',v_alloc.rewards_allocation_amount_wei::text,
      'forecastSnapshotId',v_forecast.id
    )
  ) returning id into v_ledger_id;
  return jsonb_build_object('changed',true,'cohort',v_cohort,'amountWei',v_amount::text,
    'planId',v_plan.id,'ledgerId',v_ledger_id,'bankRemainingWei',(v_bank-v_amount)::text);
end;
$function$;

commit;
