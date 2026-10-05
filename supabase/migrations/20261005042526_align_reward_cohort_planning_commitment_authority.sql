begin;

CREATE OR REPLACE FUNCTION public.read_reward_cohort_planning_snapshot(p_network text, p_app_id text, p_reward_cohort_round_id bigint DEFAULT NULL::bigint, p_allocation_receipt_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_receipt public.vebetter_round_allocations%rowtype;
  v_epoch public.reward_budget_epochs%rowtype;
  v_cohort_round bigint;
  v_reserved numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
  v_cohort_reserved numeric(78,0) := 0;
  v_adjustment numeric(78,0) := 0;
  v_designated numeric(78,0) := 0;
  v_queued integer := 0;
  v_vote_ready integer := 0;
  v_vot3_ready integer := 0;
  v_apps_two integer := 0;
  v_apps_one integer := 0;
  v_activated_zero integer := 0;
  v_pending_acceptance integer := 0;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_app_id <> v_veinvite_app_id then
    raise exception 'cohort reward planning only supports the VeInvite app';
  end if;

  if p_allocation_receipt_id is null and p_reward_cohort_round_id is null then
    select * into v_receipt
    from public.vebetter_round_allocations a
    where a.network = p_network and a.app_id = p_app_id
    order by a.vebetter_round_id desc, a.id desc
    limit 1;
    if found then v_cohort_round := v_receipt.vebetter_round_id + 1; end if;
  elsif p_allocation_receipt_id is not null and p_reward_cohort_round_id is not null then
    select * into v_receipt
    from public.vebetter_round_allocations a
    where a.id = p_allocation_receipt_id
      and a.network = p_network
      and a.app_id = p_app_id;
    v_cohort_round := p_reward_cohort_round_id;
  else
    raise exception 'cohort round and allocation receipt must be provided together';
  end if;

  if v_receipt.id is null then
    return jsonb_build_object(
      'reservedExistingWei','0','cohortReservedWei','0',
      'fundingAdjustmentWei','0','designatedBudgetWei','0',
      'rewardCohortRoundId',null,
      'pipeline',jsonb_build_object(
        'queuedEligibleCount',0,'voteReadyCount',0,'vot3ReadyCount',0,
        'appsTwoCount',0,'appsOneCount',0,'activatedZeroCount',0,
        'pendingAcceptanceCount',0
      ),
      'latestAllocation',null,'activeEpoch',null
    );
  end if;

  if v_cohort_round < 1 or v_receipt.vebetter_round_id + 1 <> v_cohort_round then
    raise exception 'allocation receipt does not fund the requested reward cohort';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0) into v_reserved
  from public.reward_queue_entries q
  where q.network = p_network
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1 from public.reward_payouts paid
      where paid.invite_code = q.invite_code and paid.status = 'PAID'
    );

  select coalesce(sum(rp.amount_wei),0) into v_legacy_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id = rp.round_id
  where rr.network = p_network and rr.app_id = p_app_id
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1 from public.reward_queue_entries q
      where q.invite_code = rp.invite_code and q.reserved_amount_wei is not null
    );
  v_reserved := v_reserved + v_legacy_reserved;

  -- Use the same lifetime gross commitment authority as reservation-time
  -- validation. This includes finalized paid reservations plus valid recovery
  -- offsets, so every planner and direct RPC consumer sees one cohort budget.
  v_cohort_reserved := public.read_reward_cohort_committed_wei(
    p_network,
    p_app_id,
    v_cohort_round,
    v_receipt.id
  );

  select coalesce(sum(a.amount_wei),0) into v_adjustment
  from public.reward_cohort_funding_adjustments a
  where a.network = p_network and a.app_id = p_app_id
    and a.reward_cohort_round_id = v_cohort_round
    and a.allocation_receipt_id = v_receipt.id;

  v_designated := v_receipt.rewards_allocation_amount_wei + v_adjustment;

  select count(*) into v_queued
  from public.invitations i
  where i.activation_network = p_network
    and i.reward_cohort_round_id = v_cohort_round
    and i.reward_funding_allocation_receipt_id = v_receipt.id
    and i.status = 'COMPLETED'
    and i.reward_status = 'ELIGIBLE'
    and i.reward_eligible_at is not null
    and not exists (
      select 1 from public.reward_queue_entries q
      where q.invite_code = i.invite_code and q.reserved_amount_wei is not null
    )
    and not exists (
      select 1 from public.reward_recovery_settlements s
      where s.invite_code = i.invite_code
    )
    and not exists (
      select 1 from public.reward_reservation_legacy_exclusions x
      where x.invite_code = i.invite_code
    );

  select count(*) into v_vote_ready
  from public.invitations i
  where i.activation_network = p_network
    and i.reward_cohort_round_id = v_cohort_round
    and i.reward_funding_allocation_receipt_id = v_receipt.id
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and i.reward_eligible_at is null and i.activated_at is not null
    and i.apps_completed >= 3
    and coalesce(i.vot3_converted,false) = true
    and coalesce(i.vote_completed,false) = false;

  select count(*) into v_vot3_ready
  from public.invitations i
  where i.activation_network = p_network
    and i.reward_cohort_round_id = v_cohort_round
    and i.reward_funding_allocation_receipt_id = v_receipt.id
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and i.reward_eligible_at is null and i.activated_at is not null
    and i.apps_completed >= 3
    and coalesce(i.vot3_converted,false) = false;

  select count(*) into v_apps_two
  from public.invitations i
  where i.activation_network = p_network
    and i.reward_cohort_round_id = v_cohort_round
    and i.reward_funding_allocation_receipt_id = v_receipt.id
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and i.reward_eligible_at is null and i.activated_at is not null
    and i.apps_completed = 2;

  select count(*) into v_apps_one
  from public.invitations i
  where i.activation_network = p_network
    and i.reward_cohort_round_id = v_cohort_round
    and i.reward_funding_allocation_receipt_id = v_receipt.id
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and i.reward_eligible_at is null and i.activated_at is not null
    and i.apps_completed = 1;

  select count(*) into v_activated_zero
  from public.invitations i
  where i.activation_network = p_network
    and i.reward_cohort_round_id = v_cohort_round
    and i.reward_funding_allocation_receipt_id = v_receipt.id
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and i.reward_eligible_at is null and i.activated_at is not null
    and i.apps_completed <= 0;

  select count(*) into v_pending_acceptance
  from public.invitations i
  where i.status = 'PENDING_ACCEPTANCE'
    and i.reward_eligible_at is null
    and i.reward_cohort_round_id is null;

  select * into v_epoch
  from public.reward_budget_epochs e
  where e.allocation_receipt_id = v_receipt.id;

  return jsonb_build_object(
    'reservedExistingWei',v_reserved::text,
    'cohortReservedWei',v_cohort_reserved::text,
    'fundingAdjustmentWei',v_adjustment::text,
    'designatedBudgetWei',v_designated::text,
    'rewardCohortRoundId',v_cohort_round,
    'pipeline',jsonb_build_object(
      'queuedEligibleCount',v_queued,'voteReadyCount',v_vote_ready,
      'vot3ReadyCount',v_vot3_ready,'appsTwoCount',v_apps_two,
      'appsOneCount',v_apps_one,'activatedZeroCount',v_activated_zero,
      'pendingAcceptanceCount',v_pending_acceptance
    ),
    'latestAllocation',jsonb_build_object(
      'id',v_receipt.id,'veBetterRoundId',v_receipt.vebetter_round_id,
      'rewardsAllocationWei',v_receipt.rewards_allocation_amount_wei::text,
      'claimBlockTimestamp',v_receipt.claim_block_timestamp
    ),
    'activeEpoch',case when v_epoch.id is null then null else jsonb_build_object(
      'id',v_epoch.id,'veBetterRoundId',v_epoch.vebetter_round_id,
      'allocationRewardsWei',v_epoch.allocation_rewards_wei::text,
      'openingPoolBalanceWei',v_epoch.opening_pool_balance_wei::text,
      'openingReservedWei',v_epoch.opening_reserved_wei::text,
      'expectedCompletions',v_epoch.expected_completions,
      'stressCompletions',v_epoch.stress_completions,
      'rewardPerInviteWei',v_epoch.reward_per_invite_wei::text,
      'algorithmVersion',v_epoch.algorithm_version,
      'pipelineSnapshot',v_epoch.pipeline_snapshot,'createdAt',v_epoch.created_at
    ) end
  );
end;
$function$
;

commit;