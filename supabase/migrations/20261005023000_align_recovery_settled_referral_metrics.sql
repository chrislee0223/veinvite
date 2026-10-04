begin;

-- A fully recovered legitimate referral has no payout queue row or positive
-- receipt. Keep user-growth and round-participation metrics aligned with the
-- recognized-referral policy without changing actual-paid reward metrics.
CREATE OR REPLACE FUNCTION public.get_operator_public_new_user_growth(p_network text, p_current_round_id bigint, p_limit integer DEFAULT 52)
 RETURNS TABLE(round_id bigint, verified_new_users bigint, activated_new_users bigint, flagged_new_users bigint, verified_returning_users bigint, activated_returning_users bigint, active_existing_rejected_users bigint, active_existing_rejection_attempts bigint, cumulative_verified_new_users bigint, cumulative_activated_new_users bigint, cumulative_flagged_new_users bigint, cumulative_verified_returning_users bigint, cumulative_activated_returning_users bigint, cumulative_active_existing_rejected_users bigint, cumulative_active_existing_rejection_attempts bigint, first_verified_entry_at timestamp with time zone, latest_verified_entry_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with parameters as (
    select
      lower(btrim(p_network)) as network,
      greatest(1::bigint, p_current_round_id) as current_round_id,
      greatest(1, least(coalesce(p_limit, 52), 260)) as history_limit,
      c.reporting_start_at,
      c.reporting_baseline_round_id
    from public.operator_reporting_config c
    where c.id = 1
      and c.reporting_start_at is not null
      and c.reporting_network = lower(btrim(p_network))
  ),
  bound_entries as (
    select
      (e.details ->> 'currentRoundId')::bigint as entry_round_id,
      e.wallet_address,
      e.entry_class,
      e.created_at,
      i.sybil_status in ('REVIEW','BLOCKED') as is_flagged,
      (
      exists (
        select 1
        from public.reward_receipts rr
        join public.reward_payout_transaction_settlements rs
          on rs.id = rr.settlement_id
        where rr.invite_code = i.invite_code
          and lower(btrim(rr.recipient_wallet))
            = lower(btrim(i.inviter_wallet))
          and lower(btrim(rr.network)) = p.network
          and lower(btrim(rs.network)) = p.network
          and rr.amount_wei > 0
      )
      or exists (
        select 1
        from public.reward_recovery_settlements s
        where s.invite_code = i.invite_code
          and s.network = p.network
          and s.settlement_kind = 'FULL_OFFSET'
          and s.net_amount_wei = 0
      )
    ) as is_activated
    from public.eligibility_check_events e
    join public.invitations i
      on i.eligibility_check_id = e.id
    cross join parameters p
    where e.network = p.network
      and e.created_at >= p.reporting_start_at
      and e.outcome = 'ELIGIBLE'
      and e.entry_class in ('NEW','RETURNING')
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        between p.reporting_baseline_round_id::numeric
        and p.current_round_id::numeric
      and not public.is_sybil_v2_referral_invalidated(
        i.invite_code,
        p.network
      )
  ),
  safe_new_wallets as (
    select
      b.wallet_address,
      min(b.entry_round_id) as cohort_round_id,
      bool_or(b.is_activated) as is_activated,
      min(b.created_at) as first_entry_at,
      max(b.created_at) as latest_entry_at
    from bound_entries b
    where b.entry_class = 'NEW'
      and (b.is_flagged is false or b.is_activated is true)
    group by b.wallet_address
  ),
  flagged_new_wallets as (
    select
      b.wallet_address,
      min(b.entry_round_id) as cohort_round_id
    from bound_entries b
    where b.entry_class = 'NEW'
      and b.is_flagged is true
      and b.is_activated is false
      and not exists (
        select 1
        from safe_new_wallets n
        where n.wallet_address = b.wallet_address
      )
    group by b.wallet_address
  ),
  safe_returning_wallets as (
    select
      b.wallet_address,
      min(b.entry_round_id) as cohort_round_id,
      bool_or(b.is_activated) as is_activated,
      min(b.created_at) as first_entry_at,
      max(b.created_at) as latest_entry_at
    from bound_entries b
    where b.entry_class = 'RETURNING'
      and (b.is_flagged is false or b.is_activated is true)
    group by b.wallet_address
  ),
  rejection_events as (
    select
      (e.details ->> 'currentRoundId')::bigint as rejection_round_id,
      e.wallet_address,
      e.created_at
    from public.eligibility_check_events e
    cross join parameters p
    where e.network = p.network
      and e.created_at >= p.reporting_start_at
      and e.outcome = 'EXISTING_VEBETTER_USER'
      and e.entry_class = 'ACTIVE_EXISTING'
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        between p.reporting_baseline_round_id::numeric
        and p.current_round_id::numeric
  ),
  first_rejection_by_wallet as (
    select
      r.wallet_address,
      min(r.rejection_round_id) as first_rejection_round_id
    from rejection_events r
    group by r.wallet_address
  ),
  new_by_round as (
    select
      n.cohort_round_id as round_id,
      count(*)::bigint as verified_new_users,
      count(*) filter (where n.is_activated)::bigint as activated_new_users,
      min(n.first_entry_at) as first_entry_at,
      max(n.latest_entry_at) as latest_entry_at
    from safe_new_wallets n
    group by n.cohort_round_id
  ),
  flagged_new_by_round as (
    select
      n.cohort_round_id as round_id,
      count(*)::bigint as flagged_new_users
    from flagged_new_wallets n
    group by n.cohort_round_id
  ),
  returning_by_round as (
    select
      r.cohort_round_id as round_id,
      count(*)::bigint as verified_returning_users,
      count(*) filter (where r.is_activated)::bigint as activated_returning_users,
      min(r.first_entry_at) as first_entry_at,
      max(r.latest_entry_at) as latest_entry_at
    from safe_returning_wallets r
    group by r.cohort_round_id
  ),
  rejection_by_round as (
    select
      r.rejection_round_id as round_id,
      count(distinct r.wallet_address)::bigint
        as active_existing_rejected_users,
      count(*)::bigint as active_existing_rejection_attempts
    from rejection_events r
    group by r.rejection_round_id
  ),
  first_rejection_by_round as (
    select
      r.first_rejection_round_id as round_id,
      count(*)::bigint as first_rejected_users
    from first_rejection_by_wallet r
    group by r.first_rejection_round_id
  ),
  round_ids as (
    select generate_series(
      1::bigint,
      (select current_round_id from parameters)
    ) as round_id
  ),
  full_trend as (
    select
      ids.round_id,
      coalesce(n.verified_new_users,0::bigint) as verified_new_users,
      coalesce(n.activated_new_users,0::bigint) as activated_new_users,
      coalesce(f.flagged_new_users,0::bigint) as flagged_new_users,
      coalesce(r.verified_returning_users,0::bigint)
        as verified_returning_users,
      coalesce(r.activated_returning_users,0::bigint)
        as activated_returning_users,
      coalesce(x.active_existing_rejected_users,0::bigint)
        as active_existing_rejected_users,
      coalesce(x.active_existing_rejection_attempts,0::bigint)
        as active_existing_rejection_attempts,
      sum(coalesce(n.verified_new_users,0::bigint))
        over(order by ids.round_id)::bigint
        as cumulative_verified_new_users,
      sum(coalesce(n.activated_new_users,0::bigint))
        over(order by ids.round_id)::bigint
        as cumulative_activated_new_users,
      sum(coalesce(f.flagged_new_users,0::bigint))
        over(order by ids.round_id)::bigint
        as cumulative_flagged_new_users,
      sum(coalesce(r.verified_returning_users,0::bigint))
        over(order by ids.round_id)::bigint
        as cumulative_verified_returning_users,
      sum(coalesce(r.activated_returning_users,0::bigint))
        over(order by ids.round_id)::bigint
        as cumulative_activated_returning_users,
      sum(coalesce(fr.first_rejected_users,0::bigint))
        over(order by ids.round_id)::bigint
        as cumulative_active_existing_rejected_users,
      sum(coalesce(x.active_existing_rejection_attempts,0::bigint))
        over(order by ids.round_id)::bigint
        as cumulative_active_existing_rejection_attempts,
      least(n.first_entry_at,r.first_entry_at)
        as first_verified_entry_at,
      greatest(n.latest_entry_at,r.latest_entry_at)
        as latest_verified_entry_at
    from round_ids ids
    left join new_by_round n using(round_id)
    left join flagged_new_by_round f using(round_id)
    left join returning_by_round r using(round_id)
    left join rejection_by_round x using(round_id)
    left join first_rejection_by_round fr using(round_id)
  )
  select t.*
  from full_trend t
  cross join parameters p
  where t.round_id > p.current_round_id - p.history_limit
    and t.round_id >= p.reporting_baseline_round_id
  order by t.round_id desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_veinvite_vebetter_round_report(p_network text, p_app_id text, p_vebetter_round_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_network text := lower(btrim(p_network));
  v_app_id text := lower(btrim(p_app_id));
  v_report jsonb;
  v_allocation public.vebetter_round_allocations%rowtype;
  v_cfg public.operator_reporting_config%rowtype;
  v_period_start timestamptz;
  v_queued_candidates bigint := 0;
  v_sybil_blocked bigint := 0;
  v_completed_onboardings bigint := 0;
  v_cumulative_completed bigint := 0;
  v_round_status text := null;
  v_round_exists boolean := false;
  v_report_complete boolean := false;
begin
  v_report := public.get_veinvite_vebetter_round_report_v1_internal(
    v_network,
    v_app_id,
    p_vebetter_round_id
  );

  select * into v_allocation
  from public.vebetter_round_allocations a
  where a.network = v_network
    and a.app_id = v_app_id
    and a.vebetter_round_id = p_vebetter_round_id;

  if not found then
    raise exception 'VEBETTER_ALLOCATION_NOT_FOUND';
  end if;

  select * into v_cfg
  from public.operator_reporting_config c
  where c.id = 1;

  if not found
     or v_cfg.reporting_start_at is null
     or v_cfg.reporting_network <> v_network then
    raise exception 'REPORTING_BASELINE_REQUIRED';
  end if;

  v_period_start := (v_report->>'periodStart')::timestamptz;

  select count(*)
  into v_queued_candidates
  from public.reward_queue_entries q
  where q.network = v_network
    and q.status = 'QUEUED'
    and q.assigned_round_id is null
    and q.eligible_at >= v_cfg.reporting_start_at
    and q.eligible_at < v_allocation.claim_block_timestamp;

  select count(distinct i.invite_code)
  into v_sybil_blocked
  from public.invitations i
  where i.activation_network = v_network
    and i.sybil_status = 'BLOCKED'
    and i.sybil_checked_at is not null
    and i.sybil_checked_at >= v_period_start
    and i.sybil_checked_at < v_allocation.claim_block_timestamp;

  select count(distinct i.invite_code)
  into v_completed_onboardings
  from public.invitations i
  where i.activation_network = v_network
    and i.reward_eligible_at >= v_period_start
    and i.reward_eligible_at < v_allocation.claim_block_timestamp
    and i.status = 'COMPLETED'
    and i.sybil_status = 'CLEAR'
    and i.reward_status in ('ELIGIBLE','PAID')
    and not public.is_sybil_v2_referral_invalidated(
      i.invite_code,
      v_network
    )
    and (
      exists (
        select 1
        from public.reward_queue_entries q
        where q.invite_code = i.invite_code
          and q.network = v_network
          and q.status <> 'CANCELLED'
      )
      or exists (
        select 1
        from public.reward_recovery_settlements s
        where s.invite_code = i.invite_code
          and s.network = v_network
          and s.settlement_kind = 'FULL_OFFSET'
          and s.net_amount_wei = 0
      )
    );

  select count(distinct i.invite_code)
  into v_cumulative_completed
  from public.invitations i
  where i.activation_network = v_network
    and i.reward_eligible_at >= v_cfg.reporting_start_at
    and i.reward_eligible_at < v_allocation.claim_block_timestamp
    and i.status = 'COMPLETED'
    and i.sybil_status = 'CLEAR'
    and i.reward_status in ('ELIGIBLE','PAID')
    and not public.is_sybil_v2_referral_invalidated(
      i.invite_code,
      v_network
    )
    and (
      exists (
        select 1
        from public.reward_queue_entries q
        where q.invite_code = i.invite_code
          and q.network = v_network
          and q.status <> 'CANCELLED'
      )
      or exists (
        select 1
        from public.reward_recovery_settlements s
        where s.invite_code = i.invite_code
          and s.network = v_network
          and s.settlement_kind = 'FULL_OFFSET'
          and s.net_amount_wei = 0
      )
    );

  select rr.status
  into v_round_status
  from public.reward_rounds rr
  where rr.network = v_network
    and rr.app_id = v_app_id
    and rr.vebetter_round_id = p_vebetter_round_id
  order by rr.id desc
  limit 1;

  v_round_exists := found;

  if v_allocation.rewards_allocation_amount_wei = 0 then
    v_report_complete := true;
  elsif v_round_exists then
    v_report_complete := v_round_status = 'COMPLETED';
  else
    v_report_complete := v_queued_candidates = 0;
  end if;

  v_report := jsonb_set(
    v_report,
    '{participation,sybilBlocked}',
    to_jsonb(v_sybil_blocked),
    false
  );
  v_report := jsonb_set(
    v_report,
    '{participation,completedOnboardings}',
    to_jsonb(v_completed_onboardings),
    false
  );
  v_report := jsonb_set(
    v_report,
    '{cumulative,completedOnboardings}',
    to_jsonb(v_cumulative_completed),
    false
  );
  v_report := jsonb_set(
    v_report,
    '{reportComplete}',
    to_jsonb(v_report_complete),
    false
  );

  return v_report || jsonb_build_object(
    'reportVersion', 'veinvite-vebetter-round-report-v2',
    'queuedCandidatesAwaitingReward', v_queued_candidates
  );
end;
$function$;

commit;
