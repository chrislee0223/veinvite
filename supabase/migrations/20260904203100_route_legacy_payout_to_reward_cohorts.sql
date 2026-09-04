begin;

-- Compatibility bridge for the already-deployed automatic payout worker.
-- Fixed per-invitation reservations are the payout authority. The worker may
-- still call the legacy RPC name while a deployment rolls forward, so route
-- that call to the oldest claimed cohort instead of trusting its latest-round
-- allocation argument.
create or replace function public.prepare_predictive_reward_batch(
  p_network text,
  p_app_id text,
  p_pool_balance_wei numeric,
  p_allocation_receipt_id bigint,
  p_expected_completions integer,
  p_stress_completions integer,
  p_reward_per_invite_wei numeric,
  p_algorithm_version text,
  p_pipeline_snapshot jsonb
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_target jsonb;
  v_target_receipt_id bigint;
  v_target_cohort_id bigint;
  v_target_planning jsonb;
  v_target_queued integer := 0;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  select public.read_next_claimed_reward_cohort(p_network,p_app_id)
  into v_target;

  if v_target is null then
    return jsonb_build_object(
      'epochId',null,
      'roundId',null,
      'epochCreated',false,
      'reason','NO_CLAIMED_REWARDS'
    );
  end if;

  v_target_receipt_id := (v_target ->> 'allocationReceiptId')::bigint;
  v_target_cohort_id := (v_target ->> 'rewardCohortRoundId')::bigint;

  v_target_planning := public.read_reward_cohort_planning_snapshot(
    p_network,
    p_app_id,
    v_target_cohort_id,
    v_target_receipt_id
  );

  v_target_queued := greatest(
    coalesce((v_target_planning #>> '{pipeline,queuedEligibleCount}')::integer,0),
    0
  );

  return public.prepare_reward_cohort_batch(
    p_network,
    p_app_id,
    p_pool_balance_wei,
    v_target_receipt_id,
    v_target_queued,
    greatest(v_target_queued,1),
    0,
    'cohort-fixed-reservation-batch-v2',
    jsonb_build_object(
      'amountMode','PER_INVITATION_FIXED_RESERVATION',
      'rewardCohortRoundId',v_target_cohort_id,
      'allocationReceiptId',v_target_receipt_id,
      'compatibilityBridge',true,
      'legacyCallerAllocationReceiptId',p_allocation_receipt_id,
      'cohortPlanning',v_target_planning,
      'legacyCallerMetadata',jsonb_build_object(
        'expectedCompletions',p_expected_completions,
        'stressCompletions',p_stress_completions,
        'rewardPerInviteWei',p_reward_per_invite_wei::text,
        'algorithmVersion',p_algorithm_version,
        'pipelineSnapshot',coalesce(p_pipeline_snapshot,'{}'::jsonb)
      )
    )
  );
end;
$$;

revoke all on function public.prepare_predictive_reward_batch(
  text,text,numeric,bigint,integer,integer,numeric,text,jsonb
) from public, anon, authenticated;
grant execute on function public.prepare_predictive_reward_batch(
  text,text,numeric,bigint,integer,integer,numeric,text,jsonb
) to service_role;

commit;
