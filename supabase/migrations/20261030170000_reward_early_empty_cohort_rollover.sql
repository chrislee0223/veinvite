-- VeInvite: guarded early rollover only for empty, uncommitted prior cohort.
-- Flag defaults OFF; existing sealed destination plans and payout records remain immutable.
-- Source baseline verified against the current Production functions on 2026-10-30.
BEGIN;

ALTER TABLE public.reward_runtime_config
  ADD COLUMN IF NOT EXISTS reward_boost_early_empty_rollover_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.read_reward_boost_reserve_unprotected_sources(p_network text, p_app_id text)
 RETURNS TABLE(reward_cohort_round_id bigint, allocation_receipt_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_long_rounds integer;
  v_current_cohort bigint;
  v_early_empty_enabled boolean;
begin
  p_network:=lower(btrim(p_network));
  p_app_id:=lower(btrim(p_app_id));

  select reward_boost_reserve_long_incomplete_rounds,
         reward_boost_early_empty_rollover_enabled
  into v_long_rounds,v_early_empty_enabled
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

  if v_current_cohort is null then
    return;
  end if;

  return query
  select
    a.vebetter_round_id+1,
    a.id
  from public.vebetter_round_allocations a
  where a.network=p_network
    and a.app_id=p_app_id
    and (
      a.vebetter_round_id+1 <= v_current_cohort-v_long_rounds
      or (
        v_early_empty_enabled
        and a.vebetter_round_id+1=v_current_cohort-1
        and public.read_reward_cohort_committed_wei(
          a.network,a.app_id,a.vebetter_round_id+1,a.id
        )=0
        and public.read_sybil_v2_cleared_unreserved_count(
          a.network,a.vebetter_round_id+1,a.id
        )=0
        and not exists (
          select 1 from public.invitations i
          where i.activation_network=a.network
            and i.reward_cohort_round_id=a.vebetter_round_id+1
        )
      )
    )
    and not exists (
      select 1
      from public.reward_boost_reserve_source_protections p
      where p.network=p_network
        and p.app_id=p_app_id
        and p.source_reward_cohort_round_id=
            a.vebetter_round_id+1
        and p.source_allocation_receipt_id=a.id
    )
  order by a.vebetter_round_id,a.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_reward_boost_reserve_source_candidate(p_network text, p_app_id text, p_source_reward_cohort_round_id bigint, p_source_allocation_receipt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_current_cohort bigint;
  v_planning jsonb;
  v_effective_budget numeric(78,0);
  v_committed numeric(78,0);
  v_available numeric(78,0);
  v_promo numeric(78,0);
  v_promo_consumed numeric(78,0);
  v_promo_remaining numeric(78,0);
  v_promo_reserve numeric(78,0);
  v_queued integer;
  v_apps0 integer;
  v_apps1 integer;
  v_apps2 integer;
  v_vot3_ready integer;
  v_vote_ready integer;
  v_expected_bps numeric(78,0);
  v_stress_bps numeric(78,0);
  v_expected_n integer;
  v_stress_growth_n integer;
  v_stress_n integer;
  v_late_reward numeric(78,0);
  v_incomplete_count integer;
  v_incomplete_bps numeric(78,0);
  v_total_weighted_bps numeric(78,0);
  v_weighted_liability numeric(78,0);
  v_max_sweepable numeric(78,0);
  v_revision text;
begin
  p_network:=lower(btrim(p_network));
  p_app_id:=lower(btrim(p_app_id));

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id=p_source_allocation_receipt_id
    and a.network=p_network
    and a.app_id=p_app_id;

  if not found
     or v_receipt.vebetter_round_id+1<>
        p_source_reward_cohort_round_id then
    raise exception 'REWARD_BOOST_RESERVE_SOURCE_MISMATCH';
  end if;

  select max(a.vebetter_round_id+1)
  into v_current_cohort
  from public.vebetter_round_allocations a
  where a.network=p_network
    and a.app_id=p_app_id;

  if v_current_cohort is null then
    raise exception 'REWARD_BOOST_RESERVE_SOURCE_NOT_MATURE';
  end if;

  if p_source_reward_cohort_round_id >
     v_current_cohort-v_cfg.reward_boost_reserve_long_incomplete_rounds then
    if not (
      v_cfg.reward_boost_early_empty_rollover_enabled
      and p_source_reward_cohort_round_id=v_current_cohort-1
      and public.read_reward_cohort_committed_wei(
        p_network,p_app_id,p_source_reward_cohort_round_id,
        p_source_allocation_receipt_id
      )=0
      -- Zero bound invitations alone is not proof of zero queued reward
      -- obligations. Treat missing queue evidence as ineligible as well.
      and public.read_sybil_v2_cleared_unreserved_count(
        p_network,p_source_reward_cohort_round_id,
        p_source_allocation_receipt_id
      )=0
      and not exists (
        select 1 from public.invitations i
        where i.activation_network=p_network
          and i.reward_cohort_round_id=p_source_reward_cohort_round_id
      )
    ) then
      raise exception 'REWARD_BOOST_RESERVE_SOURCE_NOT_MATURE';
    end if;
  end if;

  if exists (
    select 1
    from public.reward_boost_reserve_ledger l
    where l.network=p_network
      and l.app_id=p_app_id
      and l.source_reward_cohort_round_id=
          p_source_reward_cohort_round_id
      and l.source_allocation_receipt_id=
          p_source_allocation_receipt_id
      and l.entry_kind='SOURCE_SWEEP'
  ) then
    raise exception 'REWARD_BOOST_RESERVE_SOURCE_ALREADY_SWEPT';
  end if;

  v_effective_budget :=
    public.read_reward_cohort_effective_budget_wei(
      p_network,
      p_app_id,
      p_source_reward_cohort_round_id,
      p_source_allocation_receipt_id
    );

  v_committed :=
    public.read_reward_cohort_committed_wei(
      p_network,
      p_app_id,
      p_source_reward_cohort_round_id,
      p_source_allocation_receipt_id
    );

  v_available:=greatest(v_effective_budget-v_committed,0);

  select coalesce(sum(a.amount_wei),0)
  into v_promo
  from public.reward_cohort_funding_adjustments a
  where a.network=p_network
    and a.app_id=p_app_id
    and a.reward_cohort_round_id=
        p_source_reward_cohort_round_id
    and a.allocation_receipt_id=
        p_source_allocation_receipt_id
    and a.adjustment_type='PROMOTION';

  v_promo_consumed:=least(v_committed,v_promo);
  v_promo_remaining:=greatest(v_promo-v_promo_consumed,0);
  v_promo_reserve:=least(
    v_promo_remaining,
    ceil(
      v_promo *
      v_cfg.reward_boost_reserve_promotion_reserve_bps /
      10000
    )
  );

  v_planning:=public.read_reward_cohort_planning_snapshot(
    p_network,
    p_app_id,
    p_source_reward_cohort_round_id,
    p_source_allocation_receipt_id
  );

  v_queued:=coalesce(
    public.read_sybil_v2_cleared_unreserved_count(
      p_network,
      p_source_reward_cohort_round_id,
      p_source_allocation_receipt_id
    ),
    0
  )::integer;

  v_apps0:=coalesce(
    (v_planning->'pipeline'->>'activatedZeroCount')::integer,0
  );
  v_apps1:=coalesce(
    (v_planning->'pipeline'->>'appsOneCount')::integer,0
  );
  v_apps2:=coalesce(
    (v_planning->'pipeline'->>'appsTwoCount')::integer,0
  );
  v_vot3_ready:=coalesce(
    (v_planning->'pipeline'->>'vot3ReadyCount')::integer,0
  );
  v_vote_ready:=coalesce(
    (v_planning->'pipeline'->>'voteReadyCount')::integer,0
  );

  v_expected_bps :=
      v_queued*10000::numeric
    + v_vote_ready*9500::numeric
    + v_vot3_ready*9000::numeric
    + v_apps2*6000::numeric
    + v_apps1*4000::numeric
    + v_apps0*2500::numeric;

  v_stress_bps :=
      v_queued*10000::numeric
    + v_vote_ready*10000::numeric
    + v_vot3_ready*9500::numeric
    + v_apps2*8000::numeric
    + v_apps1*6000::numeric
    + v_apps0*4500::numeric;

  v_expected_n:=ceil(v_expected_bps/10000)::integer;
  v_stress_growth_n:=
    ceil(v_stress_bps*12500/100000000)::integer;

  v_stress_n:=greatest(
    4,
    v_queued,
    v_expected_n,
    v_stress_growth_n+2
  );

  v_late_reward:=
    case
      when v_stress_n>0 then floor(v_available/v_stress_n)
      else 0
    end;

  select
    count(*)::integer,
    coalesce(sum(
      case
        when coalesce(i.vote_completed,false) then 10000
        when coalesce(i.apps_completed,0)>=3
          and coalesce(i.vot3_converted,false) then 9500
        when coalesce(i.apps_completed,0)>=3 then 9000
        when coalesce(i.apps_completed,0)=2 then 6000
        when coalesce(i.apps_completed,0)=1 then 4000
        else 2500
      end
    ),0)::numeric
  into
    v_incomplete_count,
    v_incomplete_bps
  from public.invitations i
  where i.activation_network=p_network
    and i.reward_cohort_round_id=
        p_source_reward_cohort_round_id
    and i.reward_funding_allocation_receipt_id=
        p_source_allocation_receipt_id
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and coalesce(i.sybil_status,'')<>'BLOCKED'
    and not exists (
      select 1
      from public.sybil_v2_wallet_restrictions r
      where r.network=p_network
        and lower(r.wallet_address)=lower(i.invitee_wallet)
        and r.status='ACTIVE'
    );

  v_total_weighted_bps:=
    v_incomplete_bps + v_queued*10000::numeric;

  v_weighted_liability:=
    ceil(v_late_reward*v_total_weighted_bps/10000);

  v_max_sweepable:=greatest(
    v_available-v_promo_reserve-v_weighted_liability,
    0
  );

  v_revision:=
    public.read_reward_boost_reserve_source_revision(
      p_network,
      p_app_id
    );

  return jsonb_build_object(
    'network',p_network,
    'appId',p_app_id,
    'sourceRewardCohortRoundId',
      p_source_reward_cohort_round_id,
    'sourceAllocationReceiptId',
      p_source_allocation_receipt_id,
    'baselineEffectiveBudgetWei',
      v_effective_budget::text,
    'baselineCommittedWei',v_committed::text,
    'availableWei',v_available::text,
    'promotionOriginalWei',v_promo::text,
    'promotionReserveWei',v_promo_reserve::text,
    'lateRewardWei',v_late_reward::text,
    'stressRecipients',v_stress_n,
    'queuedEligibleCount',v_queued,
    'longIncompleteCount',v_incomplete_count,
    'lateWeightedBps',v_total_weighted_bps::text,
    'lateWeightedLiabilityWei',
      v_weighted_liability::text,
    'maxSweepableWei',v_max_sweepable::text,
    'sourceRevision',v_revision
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.seal_and_release_reward_boost_destination(p_network text, p_app_id text, p_observed_pool_balance_wei numeric, p_policy_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_existing public.reward_boost_reserve_destination_plans%rowtype;
  v_existing_ledger_id bigint;
  v_plan public.reward_boost_reserve_destination_plans%rowtype;
  v_ledger public.reward_boost_reserve_ledger%rowtype;
  v_current_round bigint;
  v_planning jsonb;
  v_funding_adjustment numeric(78,0);
  v_fresh_designated numeric(78,0);
  v_committed numeric(78,0);
  v_fresh_available numeric(78,0);
  v_reserved_existing numeric(78,0);
  v_physical_unreserved numeric(78,0);
  v_bank_balance numeric(78,0);
  v_bank_stress numeric(78,0);
  v_bank_available numeric(78,0);
  v_recent_protected numeric(78,0);
  v_source_retained numeric(78,0);
  v_current_pricing numeric(78,0);
  v_physical_headroom numeric(78,0);
  v_max_release numeric(78,0);
  v_early_empty_rollover numeric(78,0) := 0;
  v_adaptive_recipient_count integer := 0;
  v_boost_factor_bps integer := 10000;
  v_pipeline jsonb;
  v_reference_key text;
begin
  p_network:=lower(btrim(p_network));
  p_app_id:=lower(btrim(p_app_id));
  p_policy_version:=btrim(p_policy_version);

  if p_observed_pool_balance_wei is null
     or p_observed_pool_balance_wei<0
     or p_observed_pool_balance_wei<>
        trunc(p_observed_pool_balance_wei) then
    raise exception 'INVALID_REWARD_BOOST_OBSERVED_POOL';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_reservation_' || p_network,0
    )
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_boost_reserve_' ||
      p_network || '_' || p_app_id,0
    )
  );

  select * into v_cfg
  from public.reward_runtime_config
  where id=1
  for update;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;
  if not v_cfg.reward_boost_reserve_enabled then
    raise exception 'REWARD_BOOST_RESERVE_DISABLED';
  end if;
  if v_cfg.emergency_rewards_paused then
    raise exception 'REWARD_BOOST_RESERVE_PAUSED';
  end if;
  if p_network='mainnet'
     and not v_cfg.mainnet_funded_rewards_enabled then
    raise exception 'REWARD_BOOST_RESERVE_MAINNET_DISABLED';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.network=p_network
    and a.app_id=p_app_id
  order by a.vebetter_round_id desc,a.id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'changed',false,
      'reason','ALLOCATION_UNAVAILABLE'
    );
  end if;

  v_current_round:=v_receipt.vebetter_round_id+1;

  select * into v_existing
  from public.reward_boost_reserve_destination_plans d
  where d.network=p_network
    and d.app_id=p_app_id
    and d.destination_reward_cohort_round_id=v_current_round
    and d.destination_allocation_receipt_id=v_receipt.id;

  if found then
    select l.id
    into v_existing_ledger_id
    from public.reward_boost_reserve_ledger l
    where l.network=p_network
      and l.app_id=p_app_id
      and l.entry_kind='BOOST_RELEASE'
      and l.destination_reward_cohort_round_id=v_current_round
      and l.destination_allocation_receipt_id=v_receipt.id
      and (l.details->>'destinationPlanId')::bigint=
          v_existing.id
    order by l.id
    limit 1;

    return jsonb_build_object(
      'changed',false,
      'planId',v_existing.id,
      'boostReleaseLedgerId',v_existing_ledger_id,
      'maxBoostReleaseWei',
        v_existing.max_boost_release_wei::text
    );
  end if;

  if exists (
    select 1
    from public.reward_boost_reserve_ledger l
    where l.network=p_network
      and l.app_id=p_app_id
      and l.entry_kind='BOOST_RELEASE'
      and l.destination_reward_cohort_round_id=v_current_round
      and l.destination_allocation_receipt_id=v_receipt.id
  ) then
    raise exception 'REWARD_BOOST_DESTINATION_UNPLANNED_RELEASE_EXISTS';
  end if;

  select coalesce(sum(a.amount_wei),0)
  into v_funding_adjustment
  from public.reward_cohort_funding_adjustments a
  where a.network=p_network
    and a.app_id=p_app_id
    and a.reward_cohort_round_id=v_current_round
    and a.allocation_receipt_id=v_receipt.id;

  v_fresh_designated:=
    v_receipt.rewards_allocation_amount_wei +
    v_funding_adjustment;

  v_committed:=
    public.read_reward_cohort_committed_wei(
      p_network,p_app_id,v_current_round,v_receipt.id
    );

  v_fresh_available:=greatest(
    v_fresh_designated-v_committed,
    0
  );

  v_planning:=public.read_reward_cohort_planning_snapshot(
    p_network,
    p_app_id,
    v_current_round,
    v_receipt.id
  );

  v_reserved_existing:=
    coalesce(
      nullif(v_planning->>'reservedExistingWei','')::numeric,
      0
    );

  v_physical_unreserved:=greatest(
    p_observed_pool_balance_wei-v_reserved_existing,
    0
  );

  v_bank_balance:=
    public.read_reward_boost_reserve_balance_wei(
      p_network,p_app_id
    );
  v_bank_stress:=
    public.read_reward_boost_reserve_bank_stress_reserve_wei(
      p_network,p_app_id
    );
  v_bank_available:=greatest(
    v_bank_balance-v_bank_stress,
    0
  );

  v_recent_protected:=
    public.read_reward_boost_reserve_recent_protected_wei(
      p_network,p_app_id,v_current_round
    );

  v_source_retained:=
    public.read_reward_boost_reserve_source_retained_wei(
      p_network,p_app_id
    );

  v_current_pricing:=least(
    v_fresh_available,
    v_physical_unreserved
  );

  v_physical_headroom:=greatest(
    v_physical_unreserved -
    v_current_pricing -
    v_recent_protected -
    v_source_retained -
    v_bank_stress,
    0
  );

  -- Future allocations only. Existing destination plans are immutable and
  -- returned by the early idempotency check above, before this policy runs.
  -- The old v1 policy and the new v2 disabled default both retain the
  -- exact legacy 10000 bps ceiling.
  if v_cfg.reward_boost_reserve_adaptive_v2_enabled
     and p_policy_version='reward-boost-reserve-v2-adaptive' then
    v_pipeline:=v_planning->'pipeline';
    if v_pipeline is null
       or jsonb_typeof(v_pipeline)<>'object' then
      raise exception 'REWARD_ADAPTIVE_PIPELINE_UNAVAILABLE';
    end if;
    -- A missing cohort signal is NOT evidence of zero participation.
    -- Fail closed rather than increasing funding on incomplete data.
    if (v_pipeline->>'queuedEligibleCount' ~ '^[0-9]+$') is distinct from true
       or (v_pipeline->>'voteReadyCount' ~ '^[0-9]+$') is distinct from true
       or (v_pipeline->>'vot3ReadyCount' ~ '^[0-9]+$') is distinct from true
       or (v_pipeline->>'appsTwoCount' ~ '^[0-9]+$') is distinct from true
       or (v_pipeline->>'appsOneCount' ~ '^[0-9]+$') is distinct from true
       or (v_pipeline->>'activatedZeroCount' ~ '^[0-9]+$') is distinct from true then
      raise exception 'REWARD_ADAPTIVE_PIPELINE_INVALID';
    end if;
    v_adaptive_recipient_count :=
      (v_pipeline->>'queuedEligibleCount')::integer +
      (v_pipeline->>'voteReadyCount')::integer +
      (v_pipeline->>'vot3ReadyCount')::integer +
      (v_pipeline->>'appsTwoCount')::integer +
      (v_pipeline->>'appsOneCount')::integer +
      (v_pipeline->>'activatedZeroCount')::integer;
    if v_adaptive_recipient_count < 0 then
      raise exception 'REWARD_ADAPTIVE_PIPELINE_INVALID';
    end if;
    v_boost_factor_bps :=
      case when v_adaptive_recipient_count<=1 then 15000
           when v_adaptive_recipient_count<=3 then 12500
           else 10000 end;
  end if;

  -- A verified-empty immediately preceding cohort can make an audited
  -- SOURCE_SWEEP available for this cohort without the normal two-round delay.
  -- No payout, active invitation, unsealed sweep or missing source proof can
  -- activate this extra ceiling. Existing liquidity/other protections apply.
  if v_cfg.reward_boost_early_empty_rollover_enabled
     and v_cfg.reward_boost_reserve_adaptive_v2_enabled
     and p_policy_version='reward-boost-reserve-v2-adaptive'
     and v_current_round>1
     and v_adaptive_recipient_count=0
     and v_committed=0
     and not exists (
       select 1 from public.invitations i
       where i.activation_network=p_network
         and i.reward_cohort_round_id=v_current_round
     ) then
    select coalesce(sum(p.max_sweepable_wei),0)
    into v_early_empty_rollover
    from public.reward_boost_reserve_source_protections p
    where p.network=p_network and p.app_id=p_app_id
      and p.source_reward_cohort_round_id=v_current_round-1
      and p.baseline_committed_wei=0
      and p.queued_eligible_count=0
      and p.long_incomplete_count=0
      and p.late_weighted_liability_wei=0
      and not exists (
        select 1 from public.invitations i
        where i.activation_network=p_network
          and i.reward_cohort_round_id=p.source_reward_cohort_round_id
      )
      and exists (
        select 1 from public.reward_boost_reserve_ledger l
        where l.network=p_network and l.app_id=p_app_id
          and l.entry_kind='SOURCE_SWEEP'
          and l.source_reward_cohort_round_id=p.source_reward_cohort_round_id
          and l.source_allocation_receipt_id=p.source_allocation_receipt_id
          and l.amount_wei=p.max_sweepable_wei
      );
  end if;

  -- Physical liquidity, bank stress reserve, retained source protection,
  -- recently-funded cohorts and existing liabilities remain hard caps.
  v_max_release:=least(
    greatest(
      trunc(v_current_pricing*v_boost_factor_bps/10000),
      v_early_empty_rollover
    ),
    v_bank_available,
    v_physical_headroom
  );

  if v_max_release<=0 then
    return jsonb_build_object(
      'changed',false,
      'reason','NO_SAFE_BOOST_CAPACITY',
      'currentRewardCohortRoundId',v_current_round,
      'bankBalanceWei',v_bank_balance::text,
      'bankStressReserveWei',v_bank_stress::text,
      'recentCohortProtectedWei',v_recent_protected::text,
      'sourceRetainedProtectionWei',v_source_retained::text,
      'physicalExtraHeadroomWei',v_physical_headroom::text,
      'adaptiveBoostFactorBps',v_boost_factor_bps,
      'adaptiveActiveRecipients',v_adaptive_recipient_count,
      'auditedEarlyEmptyRolloverWei',v_early_empty_rollover::text
    );
  end if;

  insert into public.reward_boost_reserve_destination_plans(
    network,app_id,
    destination_reward_cohort_round_id,
    destination_allocation_receipt_id,
    baseline_fresh_designated_wei,
    baseline_committed_wei,
    baseline_fresh_pricing_capacity_wei,
    bank_balance_before_wei,
    bank_stress_reserve_wei,
    recent_cohort_protected_wei,
    source_retained_protection_wei,
    observed_pool_balance_wei,
    reserved_existing_wei,
    physical_extra_headroom_wei,
    max_boost_release_wei,
    policy_version
  ) values (
    p_network,p_app_id,
    v_current_round,v_receipt.id,
    v_fresh_designated,
    v_committed,
    v_current_pricing,
    v_bank_balance,
    v_bank_stress,
    v_recent_protected,
    v_source_retained,
    p_observed_pool_balance_wei,
    v_reserved_existing,
    v_physical_headroom,
    v_max_release,
    p_policy_version
  )
  returning * into v_plan;

  v_reference_key:=
    'boost-destination:' ||
    v_receipt.id::text || ':' ||
    v_plan.id::text;

  insert into public.reward_boost_reserve_ledger(
    network,app_id,entry_kind,
    destination_reward_cohort_round_id,
    destination_allocation_receipt_id,
    amount_wei,policy_version,reference_key,details
  ) values (
    p_network,p_app_id,'BOOST_RELEASE',
    v_current_round,v_receipt.id,
    v_max_release,p_policy_version,v_reference_key,
    jsonb_build_object(
      'destinationPlanId',v_plan.id,
      'bankStressReserveWei',v_bank_stress::text,
      'recentCohortProtectedWei',v_recent_protected::text,
      'sourceRetainedProtectionWei',v_source_retained::text,
      'physicalExtraHeadroomWei',v_physical_headroom::text,
      'adaptiveBoostFactorBps',v_boost_factor_bps,
      'adaptiveActiveRecipients',v_adaptive_recipient_count,
      'auditedEarlyEmptyRolloverWei',v_early_empty_rollover::text
    )
  )
  returning * into v_ledger;

  return jsonb_build_object(
    'changed',true,
    'planId',v_plan.id,
    'boostReleaseLedgerId',v_ledger.id,
    'destinationRewardCohortRoundId',v_current_round,
    'destinationAllocationReceiptId',v_receipt.id,
    'maxBoostReleaseWei',v_max_release::text,
    'freshPricingCapacityWei',v_current_pricing::text,
    'bankBalanceWei',v_bank_balance::text,
    'bankStressReserveWei',v_bank_stress::text,
    'recentCohortProtectedWei',v_recent_protected::text,
    'sourceRetainedProtectionWei',v_source_retained::text,
    'physicalExtraHeadroomWei',v_physical_headroom::text,
    'adaptiveBoostFactorBps',v_boost_factor_bps,
    'adaptiveActiveRecipients',v_adaptive_recipient_count,
      'auditedEarlyEmptyRolloverWei',v_early_empty_rollover::text
  );
end;
$function$
;

REVOKE ALL ON FUNCTION public.read_reward_boost_reserve_unprotected_sources(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_boost_reserve_unprotected_sources(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.read_reward_boost_reserve_source_candidate(text,text,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_boost_reserve_source_candidate(text,text,bigint,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.seal_and_release_reward_boost_destination(text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.seal_and_release_reward_boost_destination(text,text,numeric,text) TO service_role;

COMMIT;
