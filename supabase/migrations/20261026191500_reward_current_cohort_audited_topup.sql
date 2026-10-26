begin;

-- Default OFF. Only the explicitly selected cohort can receive this one-time top-up.
alter table public.reward_runtime_config
  add column if not exists reward_boost_current_topup_target_round_id bigint
  check (reward_boost_current_topup_target_round_id is null or reward_boost_current_topup_target_round_id > 0);

-- Emergency funding optimization without reclaiming any historical users' entitlements.
-- This is a separate immutable plan, NOT an edit to a previously sealed destination.
create table if not exists public.reward_boost_current_topup_plans(
  id bigint generated always as identity primary key,
  network text not null check (network in ('mainnet','testnet','testnet-staging')),
  app_id text not null check (app_id ~ '^0x[0-9a-f]{64}$'),
  reward_cohort_round_id bigint not null check (reward_cohort_round_id>0),
  allocation_receipt_id bigint not null references public.vebetter_round_allocations(id),
  destination_plan_id bigint not null references public.reward_boost_reserve_destination_plans(id),
  amount_wei numeric(78,0) not null check (amount_wei>0 and amount_wei=trunc(amount_wei)),
  bank_balance_before_wei numeric(78,0) not null,
  bank_stress_reserve_wei numeric(78,0) not null,
  source_retained_wei numeric(78,0) not null,
  recent_protected_wei numeric(78,0) not null,
  observed_pool_wei numeric(78,0) not null,
  global_reserved_wei numeric(78,0) not null,
  forecast_snapshot_id bigint not null references public.reward_forecast_snapshots(id),
  policy_version text not null default 'reward-boost-current-cohort-topup-v1',
  created_at timestamptz not null default now(),
  unique(network,app_id,reward_cohort_round_id,allocation_receipt_id)
);
alter table public.reward_boost_current_topup_plans enable row level security;
revoke all on public.reward_boost_current_topup_plans from public,anon,authenticated;
grant select on public.reward_boost_current_topup_plans to service_role;
drop trigger if exists reward_boost_current_topup_immutable on public.reward_boost_current_topup_plans;
create trigger reward_boost_current_topup_immutable
  before update or delete on public.reward_boost_current_topup_plans
  for each row execute function public.reject_reward_boost_reserve_ledger_mutation();

-- The existing ledger uses BOOST_RELEASE for all cohort-specific boosts.
-- Its existing conservation and stress-protection rules continue to apply.
CREATE OR REPLACE FUNCTION public.validate_reward_boost_reserve_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_source_receipt public.vebetter_round_allocations%rowtype;
  v_destination_receipt public.vebetter_round_allocations%rowtype;
  v_protection public.reward_boost_reserve_source_protections%rowtype;
  v_destination_plan public.reward_boost_reserve_destination_plans%rowtype;
  v_topup_plan public.reward_boost_current_topup_plans%rowtype;
  v_budget numeric(78,0) := 0;
  v_committed numeric(78,0) := 0;
  v_balance numeric(78,0) := 0;
  v_stress_reserve numeric(78,0) := 0;
  v_releaseable numeric(78,0) := 0;
  v_existing_source_sweep numeric(78,0) := 0;
  v_existing_boost_release numeric(78,0) := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_reservation_' || new.network,
      0
    )
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_boost_reserve_' ||
      new.network || '_' || new.app_id,
      0
    )
  );

  if new.entry_kind = 'SOURCE_SWEEP' then
    select * into v_source_receipt
    from public.vebetter_round_allocations a
    where a.id = new.source_allocation_receipt_id;

    if not found
       or v_source_receipt.network <> new.network
       or v_source_receipt.app_id <> new.app_id
       or v_source_receipt.vebetter_round_id + 1 <>
          new.source_reward_cohort_round_id then
      raise exception 'REWARD_BOOST_RESERVE_SOURCE_MISMATCH';
    end if;

    select * into v_protection
    from public.reward_boost_reserve_source_protections p
    where p.network=new.network
      and p.app_id=new.app_id
      and p.source_reward_cohort_round_id=
          new.source_reward_cohort_round_id
      and p.source_allocation_receipt_id=
          new.source_allocation_receipt_id;

    if not found then
      raise exception 'REWARD_BOOST_RESERVE_SOURCE_PROTECTION_REQUIRED';
    end if;

    select coalesce(sum(l.amount_wei),0)
    into v_existing_source_sweep
    from public.reward_boost_reserve_ledger l
    where l.network=new.network
      and l.app_id=new.app_id
      and l.entry_kind='SOURCE_SWEEP'
      and l.source_reward_cohort_round_id=
          new.source_reward_cohort_round_id
      and l.source_allocation_receipt_id=
          new.source_allocation_receipt_id;

    if v_existing_source_sweep + new.amount_wei >
       v_protection.max_sweepable_wei then
      raise exception 'REWARD_BOOST_RESERVE_SOURCE_PROTECTION_EXCEEDED';
    end if;

    v_budget := public.read_reward_cohort_effective_budget_wei(
      new.network,new.app_id,
      new.source_reward_cohort_round_id,
      new.source_allocation_receipt_id
    );

    v_committed := public.read_reward_cohort_committed_wei(
      new.network,new.app_id,
      new.source_reward_cohort_round_id,
      new.source_allocation_receipt_id
    );

    if new.amount_wei > greatest(v_budget-v_committed,0) then
      raise exception 'REWARD_BOOST_RESERVE_SOURCE_EXCEEDED';
    end if;
  else
    select * into v_destination_receipt
    from public.vebetter_round_allocations a
    where a.id = new.destination_allocation_receipt_id;

    if not found
       or v_destination_receipt.network <> new.network
       or v_destination_receipt.app_id <> new.app_id
       or v_destination_receipt.vebetter_round_id + 1 <>
          new.destination_reward_cohort_round_id then
      raise exception 'REWARD_BOOST_RESERVE_DESTINATION_MISMATCH';
    end if;

    v_balance := public.read_reward_boost_reserve_balance_wei(
      new.network,new.app_id
    );

    if new.entry_kind='BOOST_RELEASE' then
      select * into v_destination_plan
      from public.reward_boost_reserve_destination_plans d
      where d.network=new.network
        and d.app_id=new.app_id
        and d.destination_reward_cohort_round_id=
            new.destination_reward_cohort_round_id
        and d.destination_allocation_receipt_id=
            new.destination_allocation_receipt_id;

      if not found then
        raise exception 'REWARD_BOOST_DESTINATION_PLAN_REQUIRED';
      end if;

      select coalesce(sum(l.amount_wei),0)
      into v_existing_boost_release
      from public.reward_boost_reserve_ledger l
      where l.network=new.network
        and l.app_id=new.app_id
        and l.entry_kind='BOOST_RELEASE'
        and l.destination_reward_cohort_round_id=
            new.destination_reward_cohort_round_id
        and l.destination_allocation_receipt_id=
            new.destination_allocation_receipt_id;

      if new.reference_key LIKE 'boost-current-topup:%' then
        select * into v_topup_plan
        from public.reward_boost_current_topup_plans t
        where t.network=new.network and t.app_id=new.app_id
          and t.reward_cohort_round_id=new.destination_reward_cohort_round_id
          and t.allocation_receipt_id=new.destination_allocation_receipt_id;
        if not found
           or new.reference_key <> 'boost-current-topup:' ||
                v_topup_plan.allocation_receipt_id::text || ':' || v_topup_plan.id::text
           or new.amount_wei <> v_topup_plan.amount_wei then
          raise exception 'REWARD_BOOST_CURRENT_TOPUP_PLAN_MISMATCH';
        end if;
        if v_existing_boost_release + new.amount_wei >
           v_destination_plan.max_boost_release_wei + v_topup_plan.amount_wei then
          raise exception 'REWARD_BOOST_CURRENT_TOPUP_CAP_EXCEEDED';
        end if;
      elsif v_existing_boost_release + new.amount_wei >
            v_destination_plan.max_boost_release_wei then
        raise exception 'REWARD_BOOST_DESTINATION_PLAN_EXCEEDED';
      end if;

      v_stress_reserve :=
        public.read_reward_boost_reserve_bank_stress_reserve_wei(
          new.network,new.app_id
        );
      v_releaseable:=greatest(v_balance-v_stress_reserve,0);

      if new.amount_wei > v_releaseable then
        raise exception 'REWARD_BOOST_RESERVE_STRESS_RESERVE_PROTECTED';
      end if;
    elsif new.amount_wei > v_balance then
      raise exception 'REWARD_BOOST_RESERVE_BALANCE_EXCEEDED';
    end if;
  end if;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.read_reward_boost_reserve_audit_snapshot(p_network text, p_app_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_enabled boolean;
  v_shadow_enabled boolean;
  v_current_cohort bigint;
  v_source_inflow numeric(78,0);
  v_boost_outflow numeric(78,0);
  v_late_outflow numeric(78,0);
  v_bank_balance numeric(78,0);
  v_bank_stress numeric(78,0);
  v_source_retained numeric(78,0);
  v_recent_protected numeric(78,0);
  v_source_protection_count integer;
  v_destination_plan_count integer;
  v_unprotected_count integer;
  v_source_overrun_count integer;
  v_destination_overrun_count integer;
begin
  p_network:=lower(btrim(p_network));
  p_app_id:=lower(btrim(p_app_id));

  select
    reward_boost_reserve_enabled,
    reward_boost_reserve_shadow_enabled
  into
    v_enabled,
    v_shadow_enabled
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  select max(a.vebetter_round_id+1)
  into v_current_cohort
  from public.vebetter_round_allocations a
  where a.network=p_network
    and a.app_id=p_app_id;

  select
    coalesce(sum(l.amount_wei) filter (
      where l.entry_kind='SOURCE_SWEEP'
    ),0),
    coalesce(sum(l.amount_wei) filter (
      where l.entry_kind='BOOST_RELEASE'
    ),0),
    coalesce(sum(l.amount_wei) filter (
      where l.entry_kind='LATE_COMPLETION_RELEASE'
    ),0)
  into
    v_source_inflow,
    v_boost_outflow,
    v_late_outflow
  from public.reward_boost_reserve_ledger l
  where l.network=p_network
    and l.app_id=p_app_id;

  v_bank_balance :=
    v_source_inflow-v_boost_outflow-v_late_outflow;

  v_bank_stress :=
    public.read_reward_boost_reserve_bank_stress_reserve_wei(
      p_network,p_app_id
    );

  v_source_retained :=
    public.read_reward_boost_reserve_source_retained_wei(
      p_network,p_app_id
    );

  v_recent_protected :=
    case
      when v_current_cohort is null then 0
      else public.read_reward_boost_reserve_recent_protected_wei(
        p_network,p_app_id,v_current_cohort
      )
    end;

  select count(*)::integer
  into v_source_protection_count
  from public.reward_boost_reserve_source_protections p
  where p.network=p_network
    and p.app_id=p_app_id;

  select count(*)::integer
  into v_destination_plan_count
  from public.reward_boost_reserve_destination_plans d
  where d.network=p_network
    and d.app_id=p_app_id;

  select count(*)::integer
  into v_unprotected_count
  from public.read_reward_boost_reserve_unprotected_sources(
    p_network,p_app_id
  );

  select count(*)::integer
  into v_source_overrun_count
  from (
    select
      p.id,
      p.max_sweepable_wei,
      coalesce(sum(l.amount_wei),0) as swept_wei
    from public.reward_boost_reserve_source_protections p
    left join public.reward_boost_reserve_ledger l
      on l.network=p.network
     and l.app_id=p.app_id
     and l.entry_kind='SOURCE_SWEEP'
     and l.source_reward_cohort_round_id=
         p.source_reward_cohort_round_id
     and l.source_allocation_receipt_id=
         p.source_allocation_receipt_id
    where p.network=p_network
      and p.app_id=p_app_id
    group by p.id,p.max_sweepable_wei
    having coalesce(sum(l.amount_wei),0)>
           p.max_sweepable_wei
  ) x;

  select count(*)::integer
  into v_destination_overrun_count
  from (
    select
      d.id,
      d.max_boost_release_wei,
      coalesce(sum(l.amount_wei),0) as released_wei
    from public.reward_boost_reserve_destination_plans d
    left join public.reward_boost_reserve_ledger l
      on l.network=d.network
     and l.app_id=d.app_id
     and l.entry_kind='BOOST_RELEASE'
     and l.destination_reward_cohort_round_id=
         d.destination_reward_cohort_round_id
     and l.destination_allocation_receipt_id=
         d.destination_allocation_receipt_id
    left join public.reward_boost_current_topup_plans t
      on t.network=d.network and t.app_id=d.app_id
     and t.reward_cohort_round_id=d.destination_reward_cohort_round_id
     and t.allocation_receipt_id=d.destination_allocation_receipt_id
    where d.network=p_network
      and d.app_id=p_app_id
    group by d.id,d.max_boost_release_wei,t.amount_wei
    having coalesce(sum(l.amount_wei),0)>
           d.max_boost_release_wei+coalesce(t.amount_wei,0)
  ) x;

  return jsonb_build_object(
    'enabled',v_enabled,
    'shadowEnabled',v_shadow_enabled,
    'currentRewardCohortRoundId',v_current_cohort,
    'sourceInflowWei',v_source_inflow::text,
    'boostOutflowWei',v_boost_outflow::text,
    'lateCompletionOutflowWei',v_late_outflow::text,
    'bankBalanceWei',v_bank_balance::text,
    'bankStressReserveWei',v_bank_stress::text,
    'ordinaryBoostAvailableWei',
      greatest(v_bank_balance-v_bank_stress,0)::text,
    'sourceRetainedProtectionWei',v_source_retained::text,
    'recentCohortProtectedWei',v_recent_protected::text,
    'sourceProtectionCount',v_source_protection_count,
    'destinationPlanCount',v_destination_plan_count,
    'unprotectedMatureSourceCount',v_unprotected_count,
    'sourceOverrunCount',v_source_overrun_count,
    'destinationOverrunCount',v_destination_overrun_count,
    'conservationOk',
      v_bank_balance=
        v_source_inflow-v_boost_outflow-v_late_outflow,
    'stressReserveCovered',
      v_bank_balance>=v_bank_stress
  );
end;
$function$



create or replace function public.seal_and_topup_current_reward_cohort(
  p_network text, p_app_id text, p_observed_pool_balance_wei numeric
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','public'
as $topup$
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
  if not found or v_forecast.generated_at < now() - interval '30 minutes'
    or v_forecast.observed_pool_balance_wei<>p_observed_pool_balance_wei
    or v_forecast.input_snapshot->>'rewardCohortRoundId'<>v_cohort::text then
    return jsonb_build_object('changed',false,'reason','CURRENT_POOL_SNAPSHOT_REQUIRED');
  end if;
  v_committed:=public.read_reward_cohort_committed_wei(p_network,p_app_id,v_cohort,v_alloc.id);
  v_planning:=public.read_reward_cohort_planning_snapshot(p_network,p_app_id,v_cohort,v_alloc.id);
  if (v_planning->>'reservedExistingWei') is null then
    raise exception 'REWARD_CURRENT_TOPUP_RESERVATION_SNAPSHOT_MISSING';
  end if;
  v_reserved:=(v_planning->>'reservedExistingWei')::numeric;
  -- Never reprice a cohort with existing fixed claims or outstanding queue reservations.
  if v_committed<>0 or v_reserved<>0 then
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
$topup$;

revoke all on function public.seal_and_topup_current_reward_cohort(text,text,numeric) from public,anon,authenticated;
grant execute on function public.seal_and_topup_current_reward_cohort(text,text,numeric) to service_role;
commit;
