begin;

-- Keep every planning/diagnostic path aligned with the authoritative recovery
-- semantics. A FULL_OFFSET is a completed legitimate referral, but it is not an
-- unreserved/claimable reward. PARTIAL_OFFSET remains claimable through its
-- positive queue reservation until actual payout.
CREATE OR REPLACE FUNCTION public.read_predictive_reward_planning_snapshot(p_network text, p_app_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_veinvite_app_id constant text := '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_latest public.vebetter_round_allocations%rowtype;
  v_epoch public.reward_budget_epochs%rowtype;
  v_reserved numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
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
  if p_network not in ('mainnet','testnet','testnet-staging') then raise exception 'unsupported network'; end if;
  if p_app_id <> v_veinvite_app_id then raise exception 'predictive reward planning only supports the VeInvite app'; end if;

  select coalesce(sum(q.reserved_amount_wei),0) into v_reserved
  from public.reward_queue_entries q
  where q.network=p_network and q.reserved_amount_wei is not null and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists(select 1 from public.reward_payouts paid where paid.invite_code=q.invite_code and paid.status='PAID');

  select coalesce(sum(rp.amount_wei),0) into v_legacy_reserved
  from public.reward_payouts rp join public.reward_rounds rr on rr.id=rp.round_id
  where rr.network=p_network and rr.app_id=p_app_id and rp.status in ('PENDING','SENDING','FAILED')
    and not exists(select 1 from public.reward_queue_entries q where q.invite_code=rp.invite_code and q.reserved_amount_wei is not null);
  v_reserved := v_reserved + v_legacy_reserved;

  select count(*) into v_queued from public.invitations i
  where i.activation_network=p_network and i.status='COMPLETED' and i.reward_status='ELIGIBLE' and i.reward_eligible_at is not null
    and not exists(select 1 from public.reward_queue_entries q where q.invite_code=i.invite_code and q.reserved_amount_wei is not null)
    and not exists(select 1 from public.reward_recovery_settlements s where s.invite_code=i.invite_code)
    and not exists(select 1 from public.reward_reservation_legacy_exclusions x where x.invite_code=i.invite_code);

  select count(*) into v_vote_ready from public.invitations i
  where i.activation_network=p_network and i.status in ('ACTIVATING','UNDER_REVIEW') and i.reward_eligible_at is null and i.activated_at is not null
    and i.apps_completed >= 3 and coalesce(i.vot3_converted,false)=true and coalesce(i.vote_completed,false)=false;
  select count(*) into v_vot3_ready from public.invitations i
  where i.activation_network=p_network and i.status in ('ACTIVATING','UNDER_REVIEW') and i.reward_eligible_at is null and i.activated_at is not null
    and i.apps_completed >= 3 and coalesce(i.vot3_converted,false)=false;
  select count(*) into v_apps_two from public.invitations i
  where i.activation_network=p_network and i.status in ('ACTIVATING','UNDER_REVIEW') and i.reward_eligible_at is null and i.activated_at is not null and i.apps_completed=2;
  select count(*) into v_apps_one from public.invitations i
  where i.activation_network=p_network and i.status in ('ACTIVATING','UNDER_REVIEW') and i.reward_eligible_at is null and i.activated_at is not null and i.apps_completed=1;
  select count(*) into v_activated_zero from public.invitations i
  where i.activation_network=p_network and i.status in ('ACTIVATING','UNDER_REVIEW') and i.reward_eligible_at is null and i.activated_at is not null and i.apps_completed <= 0;
  select count(*) into v_pending_acceptance from public.invitations i where i.status='PENDING_ACCEPTANCE' and i.reward_eligible_at is null;

  select * into v_latest from public.vebetter_round_allocations a where a.network=p_network and a.app_id=p_app_id order by a.vebetter_round_id desc limit 1;
  if found then select * into v_epoch from public.reward_budget_epochs e where e.allocation_receipt_id=v_latest.id; end if;

  return jsonb_build_object(
    'reservedExistingWei',v_reserved::text,
    'pipeline',jsonb_build_object(
      'queuedEligibleCount',v_queued,'voteReadyCount',v_vote_ready,'vot3ReadyCount',v_vot3_ready,
      'appsTwoCount',v_apps_two,'appsOneCount',v_apps_one,'activatedZeroCount',v_activated_zero,'pendingAcceptanceCount',v_pending_acceptance
    ),
    'latestAllocation',case when v_latest.id is null then null else jsonb_build_object(
      'id',v_latest.id,'veBetterRoundId',v_latest.vebetter_round_id,'rewardsAllocationWei',v_latest.rewards_allocation_amount_wei::text,'claimBlockTimestamp',v_latest.claim_block_timestamp
    ) end,
    'activeEpoch',case when v_epoch.id is null then null else jsonb_build_object(
      'id',v_epoch.id,'veBetterRoundId',v_epoch.vebetter_round_id,'allocationRewardsWei',v_epoch.allocation_rewards_wei::text,
      'openingPoolBalanceWei',v_epoch.opening_pool_balance_wei::text,'openingReservedWei',v_epoch.opening_reserved_wei::text,
      'expectedCompletions',v_epoch.expected_completions,'stressCompletions',v_epoch.stress_completions,'rewardPerInviteWei',v_epoch.reward_per_invite_wei::text,
      'algorithmVersion',v_epoch.algorithm_version,'pipelineSnapshot',v_epoch.pipeline_snapshot,'createdAt',v_epoch.created_at
    ) end
  );
end;
$function$;

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

  select coalesce(sum(q.reserved_amount_wei),0) into v_cohort_reserved
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code = q.invite_code
  where q.network = p_network
    and i.reward_funding_allocation_receipt_id = v_receipt.id
    and i.reward_cohort_round_id = v_cohort_round
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1 from public.reward_payouts paid
      where paid.invite_code = q.invite_code and paid.status = 'PAID'
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
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_reservation_candidates(p_network text, p_limit integer DEFAULT 25)
 RETURNS TABLE(invite_code text, completion_block bigint, completion_tx_index integer, completion_clause_index integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with parameters as (
    select lower(btrim(p_network)) as network, greatest(1,least(coalesce(p_limit,25),100)) as row_limit
  )
  select i.invite_code, completion.block_number::bigint, completion.tx_index::integer, completion.clause_index::integer
  from public.invitations i
  cross join parameters p
  cross join lateral (
    select e.block_number,e.tx_index,e.clause_index
    from public.invite_impact_events e
    where e.invite_code=i.invite_code
      and e.network=p.network
      and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
      and e.block_number is not null and e.tx_index is not null and e.clause_index is not null
    order by e.block_number desc,e.tx_index desc,e.clause_index desc
    limit 1
  ) completion
  where i.activation_network=p.network
    and i.status='COMPLETED'
    and i.reward_status='ELIGIBLE'
    and i.reward_eligible_at is not null
    and i.sybil_status='CLEAR'
    and i.sybil_checked_at is not null
    and i.impact_sync_complete_at is not null
    and i.inviter_wallet is not null
    and i.invitee_wallet is not null
    and i.eligibility_check_id is not null
    and not exists (select 1 from public.reward_queue_entries q where q.invite_code=i.invite_code)
    and not exists (select 1 from public.reward_recovery_settlements s where s.invite_code=i.invite_code)
    and not exists (select 1 from public.reward_reservation_legacy_exclusions x where x.invite_code=i.invite_code)
  order by completion.block_number,completion.tx_index,completion.clause_index,i.invite_code
  limit (select row_limit from parameters);
$function$;

CREATE OR REPLACE FUNCTION public.get_operator_round_overview(p_network text, p_vebetter_round_id bigint, p_round_start_at timestamp with time zone, p_round_end_at timestamp with time zone, p_round_start_block bigint, p_round_end_block bigint)
 RETURNS TABLE(invitations_created bigint, unique_inviters bigint, claimed_invitations bigint, verified_new_invitees bigint, verified_returning_invitees bigint, active_existing_rejections bigint, legacy_unclassified_claims bigint, completed_referrals bigint, currently_eligible_referrals bigint, paid_referrals bigint, total_veinvite_reward_wei numeric, qualifying_dapp_reward_events bigint, total_qualifying_dapp_reward_wei numeric, flagged_referrals bigint, latest_recorded_activity_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with round_invitations as (
    select i.* from public.invitations i where i.created_at>=p_round_start_at and i.created_at<=p_round_end_at
      and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)
  ), round_entry_checks as (
    select e.* from public.eligibility_check_events e where e.network=p_network and e.details->>'currentRoundId'=p_vebetter_round_id::text
      and not public.is_analytics_excluded_wallet(e.wallet_address) and not public.is_analytics_excluded_invite_code(e.invite_code)
  ), eligible_round_claims as (
    select i.*,e.entry_class,e.created_at as entry_checked_at from round_entry_checks e join public.invitations i on i.eligibility_check_id=e.id
    where e.outcome='ELIGIBLE' and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)
  ), round_impact as (
    select e.* from public.invite_impact_events e where e.network=p_network and e.block_number between p_round_start_block and p_round_end_block
      and not public.is_analytics_excluded_wallet(e.wallet_address) and not public.is_analytics_excluded_invite_code(e.invite_code)
  ), round_receipts as (
    select r.* from public.reward_receipts r where r.network=p_network and r.vebetter_round_id=p_vebetter_round_id
      and not public.is_analytics_excluded_wallet(r.recipient_wallet) and not public.is_analytics_excluded_invite_code(r.invite_code)
  )
  select
    (select count(*)::bigint from round_invitations),(select count(distinct lower(btrim(i.inviter_wallet)))::bigint from round_invitations i),
    (select count(*)::bigint from eligible_round_claims),(select count(*)::bigint from eligible_round_claims c where c.entry_class='NEW'),
    (select count(*)::bigint from eligible_round_claims c where c.entry_class='RETURNING'),
    (select count(*)::bigint from round_entry_checks e where e.outcome='EXISTING_VEBETTER_USER' and e.entry_class='ACTIVE_EXISTING'),
    (select count(*)::bigint from public.invitations i where i.activated_at>=p_round_start_at and i.activated_at<=p_round_end_at and i.eligibility_check_id is null and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)),
    (select count(*)::bigint from public.invitations i where i.activation_network=p_network and i.eligibility_check_id is not null and i.status='COMPLETED' and i.apps_completed>=3 and i.apps_completed_block is not null and i.vot3_converted is true and i.vot3_converted_block is not null and i.vote_completed is true and i.vote_completed_block is not null and greatest(i.apps_completed_block,i.vot3_converted_block,i.vote_completed_block) between p_round_start_block and p_round_end_block and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)),
    (select count(*)::bigint from eligible_round_claims c where c.reward_status='ELIGIBLE' and not exists (
      select 1
      from public.reward_recovery_settlements s
      where s.invite_code=c.invite_code
        and s.settlement_kind='FULL_OFFSET'
        and s.net_amount_wei=0
    )),
    (select count(distinct r.invite_code)::bigint from round_receipts r),(select coalesce(sum(r.amount_wei),0::numeric) from round_receipts r),
    (select count(*)::bigint from round_impact e where e.event_type='DAPP_REWARD'),(select coalesce(sum(e.amount_wei::numeric),0::numeric) from round_impact e where e.event_type='DAPP_REWARD'),
    (select count(*)::bigint from eligible_round_claims c where c.sybil_status in ('REVIEW','BLOCKED')),
    greatest((select max(i.updated_at) from round_invitations i),(select max(e.created_at) from round_entry_checks e),(select max(e.detected_at) from round_impact e),(select max(r.created_at) from round_receipts r));
$function$;

CREATE OR REPLACE FUNCTION public.get_operator_cumulative_overview(p_network text)
 RETURNS TABLE(invitations_created bigint, unique_inviters bigint, claimed_invitations bigint, verified_new_invitees bigint, verified_returning_invitees bigint, active_existing_rejections bigint, legacy_unclassified_claims bigint, completed_referrals bigint, currently_eligible_referrals bigint, paid_referrals bigint, total_veinvite_reward_wei numeric, qualifying_dapp_reward_events bigint, total_qualifying_dapp_reward_wei numeric, flagged_referrals bigint, latest_recorded_activity_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with network_entry_checks as (
    select e.* from public.eligibility_check_events e where e.network=p_network
      and not public.is_analytics_excluded_wallet(e.wallet_address)
      and not public.is_analytics_excluded_invite_code(e.invite_code)
  ), eligible_claims as (
    select i.*,e.entry_class,e.created_at as entry_checked_at
    from network_entry_checks e join public.invitations i on i.eligibility_check_id=e.id
    where e.outcome='ELIGIBLE' and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)
  ), network_impact as (
    select e.* from public.invite_impact_events e where e.network=p_network
      and not public.is_analytics_excluded_wallet(e.wallet_address) and not public.is_analytics_excluded_invite_code(e.invite_code)
  ), network_receipts as (
    select r.* from public.reward_receipts r where r.network=p_network
      and not public.is_analytics_excluded_wallet(r.recipient_wallet) and not public.is_analytics_excluded_invite_code(r.invite_code)
  )
  select
    (select count(*)::bigint from public.invitations i where not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)),
    (select count(distinct lower(btrim(i.inviter_wallet)))::bigint from public.invitations i where not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)),
    (select count(*)::bigint from eligible_claims),(select count(*)::bigint from eligible_claims c where c.entry_class='NEW'),
    (select count(*)::bigint from eligible_claims c where c.entry_class='RETURNING'),
    (select count(*)::bigint from network_entry_checks e where e.outcome='EXISTING_VEBETTER_USER' and e.entry_class='ACTIVE_EXISTING'),
    (select count(*)::bigint from public.invitations i where i.activated_at is not null and i.eligibility_check_id is null and (i.activation_network=p_network or i.activation_network is null) and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)),
    (select count(*)::bigint from public.invitations i where i.activation_network=p_network and i.eligibility_check_id is not null and i.status='COMPLETED' and i.apps_completed>=3 and i.apps_completed_block is not null and i.vot3_converted is true and i.vot3_converted_block is not null and i.vote_completed is true and i.vote_completed_block is not null and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)),
    (select count(*)::bigint from eligible_claims c where c.reward_status='ELIGIBLE' and not exists (
      select 1
      from public.reward_recovery_settlements s
      where s.invite_code=c.invite_code
        and s.settlement_kind='FULL_OFFSET'
        and s.net_amount_wei=0
    )),
    (select count(distinct r.invite_code)::bigint from network_receipts r),(select coalesce(sum(r.amount_wei),0::numeric) from network_receipts r),
    (select count(*)::bigint from network_impact e where e.event_type='DAPP_REWARD'),
    (select coalesce(sum(e.amount_wei::numeric),0::numeric) from network_impact e where e.event_type='DAPP_REWARD'),
    (select count(*)::bigint from eligible_claims c where c.sybil_status in ('REVIEW','BLOCKED')),
    greatest((select max(i.updated_at) from public.invitations i where not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)),(select max(e.created_at) from network_entry_checks e),(select max(e.detected_at) from network_impact e),(select max(r.created_at) from network_receipts r));
$function$;

CREATE OR REPLACE FUNCTION public.get_operator_round_inviter_analytics(p_network text, p_vebetter_round_id bigint, p_round_start_at timestamp with time zone, p_round_end_at timestamp with time zone, p_round_start_block bigint, p_round_end_block bigint, p_limit integer DEFAULT 100)
 RETURNS TABLE(wallet_address text, invitations_created bigint, claimed_invitations bigint, unique_invitees bigint, verified_new_invitees bigint, verified_returning_invitees bigint, completed_referrals bigint, currently_eligible_referrals bigint, paid_referrals bigint, reward_receipt_count bigint, total_veinvite_reward_wei numeric, flagged_referrals bigint, first_invite_at timestamp with time zone, last_activity_at timestamp with time zone, last_reward_paid_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with created_stats as (
    select lower(btrim(i.inviter_wallet)) as wallet_address,count(*)::bigint as invitations_created,
      min(i.created_at) as first_invite_at,max(i.created_at) as last_invite_at
    from public.invitations i
    where i.created_at>=p_round_start_at and i.created_at<=p_round_end_at
      and not public.is_analytics_excluded_wallet(i.inviter_wallet)
      and not public.is_analytics_excluded_wallet(i.invitee_wallet)
    group by lower(btrim(i.inviter_wallet))
  ), claim_rows as (
    select lower(btrim(i.inviter_wallet)) as wallet_address,lower(btrim(e.wallet_address)) as invitee_wallet,
      i.invite_code,e.entry_class,e.created_at as entry_checked_at,i.reward_status,i.sybil_status
    from public.eligibility_check_events e join public.invitations i on i.eligibility_check_id=e.id
    where e.network=p_network and e.details->>'currentRoundId'=p_vebetter_round_id::text and e.outcome='ELIGIBLE'
      and not public.is_analytics_excluded_wallet(i.inviter_wallet)
      and not public.is_analytics_excluded_wallet(e.wallet_address)
  ), claim_stats as (
    select c.wallet_address,count(*)::bigint as claimed_invitations,
      count(distinct c.invitee_wallet)::bigint as unique_invitees,
      count(*) filter(where c.entry_class='NEW')::bigint as verified_new_invitees,
      count(*) filter(where c.entry_class='RETURNING')::bigint as verified_returning_invitees,
      count(*) filter(
        where c.reward_status='ELIGIBLE'
          and not exists (
            select 1
            from public.reward_recovery_settlements s
            where s.invite_code=c.invite_code
              and s.settlement_kind='FULL_OFFSET'
              and s.net_amount_wei=0
          )
      )::bigint as currently_eligible_referrals,
      count(*) filter(where c.sybil_status in ('REVIEW','BLOCKED'))::bigint as flagged_referrals,
      max(c.entry_checked_at) as last_claim_at
    from claim_rows c group by c.wallet_address
  ), completion_stats as (
    select lower(btrim(i.inviter_wallet)) as wallet_address,count(*)::bigint as completed_referrals,
      max(greatest(i.apps_completed_at,i.vot3_converted_at,i.vote_completed_at)) as last_completion_at
    from public.invitations i
    where i.activation_network=p_network and i.eligibility_check_id is not null and i.status='COMPLETED'
      and i.apps_completed>=3 and i.apps_completed_block is not null and i.vot3_converted is true and i.vot3_converted_block is not null
      and i.vote_completed is true and i.vote_completed_block is not null
      and greatest(i.apps_completed_block,i.vot3_converted_block,i.vote_completed_block) between p_round_start_block and p_round_end_block
      and not public.is_analytics_excluded_wallet(i.inviter_wallet)
      and not public.is_analytics_excluded_wallet(i.invitee_wallet)
    group by lower(btrim(i.inviter_wallet))
  ), reward_stats as (
    select lower(btrim(r.recipient_wallet)) as wallet_address,count(*)::bigint as reward_receipt_count,
      count(distinct r.invite_code)::bigint as paid_referrals,sum(r.amount_wei) as total_veinvite_reward_wei,
      max(r.paid_at) as last_reward_paid_at
    from public.reward_receipts r
    where r.network=p_network and r.vebetter_round_id=p_vebetter_round_id
      and not public.is_analytics_excluded_wallet(r.recipient_wallet)
      and not public.is_analytics_excluded_invite_code(r.invite_code)
    group by lower(btrim(r.recipient_wallet))
  ), wallets as (
    select wallet_address from created_stats union select wallet_address from claim_stats
    union select wallet_address from completion_stats union select wallet_address from reward_stats
  )
  select w.wallet_address,coalesce(c.invitations_created,0::bigint),coalesce(q.claimed_invitations,0::bigint),
    coalesce(q.unique_invitees,0::bigint),coalesce(q.verified_new_invitees,0::bigint),coalesce(q.verified_returning_invitees,0::bigint),
    coalesce(x.completed_referrals,0::bigint),coalesce(q.currently_eligible_referrals,0::bigint),coalesce(r.paid_referrals,0::bigint),
    coalesce(r.reward_receipt_count,0::bigint),coalesce(r.total_veinvite_reward_wei,0::numeric),coalesce(q.flagged_referrals,0::bigint),
    c.first_invite_at,greatest(c.last_invite_at,q.last_claim_at,x.last_completion_at,r.last_reward_paid_at),r.last_reward_paid_at
  from wallets w left join created_stats c using(wallet_address) left join claim_stats q using(wallet_address)
  left join completion_stats x using(wallet_address) left join reward_stats r using(wallet_address)
  order by coalesce(c.invitations_created,0::bigint) desc,coalesce(q.claimed_invitations,0::bigint) desc,w.wallet_address
  limit greatest(1,least(p_limit,100));
$function$;

CREATE OR REPLACE FUNCTION public.get_operator_cumulative_inviter_analytics(p_network text, p_limit integer DEFAULT 100)
 RETURNS TABLE(wallet_address text, invitations_created bigint, claimed_invitations bigint, unique_invitees bigint, verified_new_invitees bigint, verified_returning_invitees bigint, completed_referrals bigint, currently_eligible_referrals bigint, paid_referrals bigint, reward_receipt_count bigint, total_veinvite_reward_wei numeric, flagged_referrals bigint, first_invite_at timestamp with time zone, last_activity_at timestamp with time zone, last_reward_paid_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with created_stats as (
    select lower(btrim(i.inviter_wallet)) as wallet_address,count(*)::bigint as invitations_created,
      min(i.created_at) as first_invite_at,max(i.created_at) as last_invite_at
    from public.invitations i
    where not public.is_analytics_excluded_wallet(i.inviter_wallet)
      and not public.is_analytics_excluded_wallet(i.invitee_wallet)
    group by lower(btrim(i.inviter_wallet))
  ), claim_rows as (
    select lower(btrim(i.inviter_wallet)) as wallet_address,lower(btrim(e.wallet_address)) as invitee_wallet,
      i.invite_code,e.entry_class,e.created_at as entry_checked_at,i.reward_status,i.sybil_status
    from public.eligibility_check_events e join public.invitations i on i.eligibility_check_id=e.id
    where e.network=p_network and e.outcome='ELIGIBLE'
      and not public.is_analytics_excluded_wallet(i.inviter_wallet)
      and not public.is_analytics_excluded_wallet(e.wallet_address)
  ), claim_stats as (
    select c.wallet_address,count(*)::bigint as claimed_invitations,
      count(distinct c.invitee_wallet)::bigint as unique_invitees,
      count(*) filter(where c.entry_class='NEW')::bigint as verified_new_invitees,
      count(*) filter(where c.entry_class='RETURNING')::bigint as verified_returning_invitees,
      count(*) filter(
        where c.reward_status='ELIGIBLE'
          and not exists (
            select 1
            from public.reward_recovery_settlements s
            where s.invite_code=c.invite_code
              and s.settlement_kind='FULL_OFFSET'
              and s.net_amount_wei=0
          )
      )::bigint as currently_eligible_referrals,
      count(*) filter(where c.sybil_status in ('REVIEW','BLOCKED'))::bigint as flagged_referrals,
      max(c.entry_checked_at) as last_claim_at
    from claim_rows c group by c.wallet_address
  ), completion_stats as (
    select lower(btrim(i.inviter_wallet)) as wallet_address,count(*)::bigint as completed_referrals,
      max(greatest(i.apps_completed_at,i.vot3_converted_at,i.vote_completed_at)) as last_completion_at
    from public.invitations i
    where i.activation_network=p_network and i.eligibility_check_id is not null and i.status='COMPLETED'
      and i.apps_completed>=3 and i.apps_completed_block is not null and i.vot3_converted is true
      and i.vot3_converted_block is not null and i.vote_completed is true and i.vote_completed_block is not null
      and not public.is_analytics_excluded_wallet(i.inviter_wallet)
      and not public.is_analytics_excluded_wallet(i.invitee_wallet)
    group by lower(btrim(i.inviter_wallet))
  ), reward_stats as (
    select lower(btrim(r.recipient_wallet)) as wallet_address,count(*)::bigint as reward_receipt_count,
      count(distinct r.invite_code)::bigint as paid_referrals,sum(r.amount_wei) as total_veinvite_reward_wei,
      max(r.paid_at) as last_reward_paid_at
    from public.reward_receipts r
    where r.network=p_network
      and not public.is_analytics_excluded_wallet(r.recipient_wallet)
      and not public.is_analytics_excluded_invite_code(r.invite_code)
    group by lower(btrim(r.recipient_wallet))
  ), wallets as (
    select wallet_address from created_stats union select wallet_address from claim_stats
    union select wallet_address from completion_stats union select wallet_address from reward_stats
  )
  select w.wallet_address,coalesce(c.invitations_created,0::bigint),coalesce(q.claimed_invitations,0::bigint),
    coalesce(q.unique_invitees,0::bigint),coalesce(q.verified_new_invitees,0::bigint),coalesce(q.verified_returning_invitees,0::bigint),
    coalesce(x.completed_referrals,0::bigint),coalesce(q.currently_eligible_referrals,0::bigint),coalesce(r.paid_referrals,0::bigint),
    coalesce(r.reward_receipt_count,0::bigint),coalesce(r.total_veinvite_reward_wei,0::numeric),coalesce(q.flagged_referrals,0::bigint),
    c.first_invite_at,greatest(c.last_invite_at,q.last_claim_at,x.last_completion_at,r.last_reward_paid_at),r.last_reward_paid_at
  from wallets w left join created_stats c using(wallet_address) left join claim_stats q using(wallet_address)
  left join completion_stats x using(wallet_address) left join reward_stats r using(wallet_address)
  order by coalesce(c.invitations_created,0::bigint) desc,coalesce(q.claimed_invitations,0::bigint) desc,w.wallet_address
  limit greatest(1,least(p_limit,100));
$function$;

commit;
