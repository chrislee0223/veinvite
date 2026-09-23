begin;

-- Final rollout compatibility layer. This migration intentionally repeats the
-- authoritative definitions that touch live reward/participation UX so the
-- database is safe while the application rolls from legacy -> shadow -> v2.
create or replace function public.read_reward_reservation_candidates_v2(
  p_network text,
  p_limit integer default 25
)
returns table(
  invite_code text,
  completion_block bigint,
  completion_tx_index integer,
  completion_clause_index integer,
  reward_cohort_round_id bigint,
  reward_funding_allocation_receipt_id bigint
)
language sql
stable
set search_path = pg_catalog, public
as $$
  with parameters as (
    select lower(btrim(p_network)) as network,
           greatest(1,least(coalesce(p_limit,25),100)) as row_limit
  )
  select i.invite_code, completion.block_number::bigint,
         completion.tx_index::integer, completion.clause_index::integer,
         i.reward_cohort_round_id, i.reward_funding_allocation_receipt_id
  from public.invitations i
  cross join parameters p
  left join public.sybil_v2_referral_assessments a
    on a.invite_code = i.invite_code
  left join public.sybil_v2_reward_clearances c
    on c.invite_code = i.invite_code
   and c.network = p.network
   and c.verdict = a.state
   and c.assessment_revision = a.revision
  cross join lateral (
    select e.block_number,e.tx_index,e.clause_index
    from public.invite_impact_events e
    where e.invite_code = i.invite_code and e.network = p.network
      and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
      and e.block_number is not null and e.tx_index is not null
      and e.clause_index is not null
    order by e.block_number desc,e.tx_index desc,e.clause_index desc
    limit 1
  ) completion
  where i.activation_network = p.network
    and i.status = 'COMPLETED' and i.reward_status = 'ELIGIBLE'
    and i.reward_eligible_at is not null and i.sybil_status = 'CLEAR'
    and i.sybil_checked_at is not null and i.impact_sync_complete_at is not null
    and i.inviter_wallet is not null and i.invitee_wallet is not null
    and i.eligibility_check_id is not null
    and i.reward_cohort_round_id is not null
    and i.reward_funding_allocation_receipt_id is not null
    and (
      not public.sybil_v2_enforcement_enabled()
      or (
        a.state in ('CLEAR','WATCH')
        and c.id is not null
      )
    )
    and (
      not public.sybil_v2_enforcement_enabled()
      or not exists (
      select 1
      from public.sybil_v2_wallet_restrictions r
      where r.network = p.network
        and r.status = 'ACTIVE'
        and r.wallet_address in (
          lower(i.inviter_wallet),
          lower(i.invitee_wallet)
        )
      )
    )
    and not exists (
      select 1 from public.reward_queue_entries q where q.invite_code = i.invite_code
    )
    and not exists (
      select 1 from public.reward_reservation_legacy_exclusions x where x.invite_code = i.invite_code
    )
  order by completion.block_number,completion.tx_index,completion.clause_index,i.invite_code
  limit (select row_limit from parameters);
$$;

create or replace function public.commit_reward_reservation(
  p_invite_code text,
  p_network text,
  p_observed_pool_balance_wei numeric,
  p_expected_reserved_before_wei numeric,
  p_amount_wei numeric,
  p_algorithm_version text,
  p_quote_snapshot_id bigint,
  p_finalized_block bigint,
  p_basis jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_invitation public.invitations%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_clearance public.sybil_v2_reward_clearances%rowtype;
  v_entry_class text;
  v_reserved numeric(78,0) := 0;
  v_legacy_payout_reserved numeric(78,0) := 0;
  v_completion_block bigint;
  v_completion_tx_index integer;
  v_completion_clause_index integer;
  v_mainnet_enabled boolean;
  v_emergency_paused boolean;
  v_sybil_v2_enforced boolean := false;
  v_now timestamptz := now();
begin
  if v_code is null or v_code='' then raise exception 'INVITE_CODE_REQUIRED'; end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then raise exception 'UNSUPPORTED_NETWORK'; end if;
  if p_observed_pool_balance_wei is null or p_observed_pool_balance_wei < 0 or p_observed_pool_balance_wei <> trunc(p_observed_pool_balance_wei) then raise exception 'INVALID_OBSERVED_POOL_BALANCE'; end if;
  if p_expected_reserved_before_wei is null or p_expected_reserved_before_wei < 0 or p_expected_reserved_before_wei <> trunc(p_expected_reserved_before_wei) then raise exception 'INVALID_EXPECTED_RESERVED'; end if;
  if p_amount_wei is null or p_amount_wei <= 0 or p_amount_wei <> trunc(p_amount_wei) then raise exception 'INVALID_REWARD_AMOUNT'; end if;
  if p_finalized_block is null or p_finalized_block < 0 then raise exception 'INVALID_FINALIZED_BLOCK'; end if;
  if p_algorithm_version is null or length(btrim(p_algorithm_version)) not between 1 and 80 then raise exception 'INVALID_ALGORITHM_VERSION'; end if;
  if p_basis is null or jsonb_typeof(p_basis) <> 'object' then raise exception 'INVALID_RESERVATION_BASIS'; end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
  select mainnet_funded_rewards_enabled, emergency_rewards_paused, sybil_v2_enforcement_enabled
  into v_mainnet_enabled, v_emergency_paused, v_sybil_v2_enforced
  from public.reward_runtime_config
  where id = 1;
  if not found then raise exception 'REWARD_RUNTIME_CONFIG_MISSING'; end if;
  if v_emergency_paused then raise exception 'REWARD_RESERVATION_PAUSED'; end if;
  if v_network = 'mainnet' and not v_mainnet_enabled then raise exception 'REWARD_RESERVATION_DISABLED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_' || v_network,0));

  select * into v_invitation from public.invitations i where i.invite_code=v_code for update;
  if not found
     or v_invitation.activation_network <> v_network
     or v_invitation.status <> 'COMPLETED'
     or v_invitation.reward_status <> 'ELIGIBLE'
     or v_invitation.reward_eligible_at is null
     or v_invitation.sybil_status <> 'CLEAR'
     or v_invitation.sybil_checked_at is null
     or v_invitation.impact_sync_complete_at is null
     or v_invitation.inviter_wallet is null
     or v_invitation.invitee_wallet is null
     or v_invitation.eligibility_check_id is null then
    return jsonb_build_object('reserved',false,'reason','NOT_ELIGIBLE');
  end if;

  select c.* into v_clearance
  from public.sybil_v2_reward_clearances c
  join public.sybil_v2_referral_assessments a
    on a.invite_code = c.invite_code
   and a.revision = c.assessment_revision
   and a.state = c.verdict
  where c.invite_code = v_code
    and c.network = v_network
    and c.verdict in ('CLEAR','WATCH');

  if v_sybil_v2_enforced and not found then
    return jsonb_build_object('reserved',false,'reason','SYBIL_V2_CLEARANCE_MISSING');
  end if;

  if v_sybil_v2_enforced and exists (
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network = v_network
      and r.status = 'ACTIVE'
      and r.wallet_address in (
        lower(v_invitation.inviter_wallet),
        lower(v_invitation.invitee_wallet)
      )
  ) then
    return jsonb_build_object('reserved',false,'reason','SYBIL_V2_RESTRICTED');
  end if;

  if exists(select 1 from public.reward_reservation_legacy_exclusions x where x.invite_code=v_code) then
    return jsonb_build_object('reserved',false,'reason','LEGACY_EXCLUDED');
  end if;

  select * into v_queue from public.reward_queue_entries q where q.invite_code=v_code for update;
  if found then
    if v_queue.reserved_amount_wei is not null then
      return jsonb_build_object('reserved',true,'reason','ALREADY_RESERVED','inviteCode',v_queue.invite_code,'amountWei',v_queue.reserved_amount_wei::text,'reservedAt',v_queue.reserved_at,'status',v_queue.status);
    end if;
    return jsonb_build_object('reserved',false,'reason','LEGACY_QUEUE_ENTRY');
  end if;

  select e.block_number::bigint,e.tx_index::integer,e.clause_index::integer into v_completion_block,v_completion_tx_index,v_completion_clause_index
  from public.invite_impact_events e
  where e.invite_code=v_code and e.network=v_network
    and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
    and e.block_number is not null and e.tx_index is not null and e.clause_index is not null
  order by e.block_number desc,e.tx_index desc,e.clause_index desc limit 1;
  if v_completion_block is null or v_completion_tx_index is null or v_completion_clause_index is null then return jsonb_build_object('reserved',false,'reason','COMPLETION_POSITION_MISSING'); end if;
  if v_completion_block > p_finalized_block then return jsonb_build_object('reserved',false,'reason','AWAITING_FINALITY','completionBlock',v_completion_block,'finalizedBlock',p_finalized_block); end if;

  select e.entry_class into v_entry_class
  from public.eligibility_check_events e
  where e.id=v_invitation.eligibility_check_id and e.invite_code=v_code and e.wallet_address=lower(v_invitation.invitee_wallet)
    and e.network=v_network and e.outcome='ELIGIBLE' and e.entry_class in ('NEW','RETURNING');
  if v_entry_class not in ('NEW','RETURNING') then return jsonb_build_object('reserved',false,'reason','ENTRY_PROOF_MISSING'); end if;

  select coalesce(sum(q.reserved_amount_wei),0) into v_reserved
  from public.reward_queue_entries q
  where q.network=v_network and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists(select 1 from public.reward_payouts paid where paid.invite_code=q.invite_code and paid.status='PAID');

  select coalesce(sum(rp.amount_wei),0) into v_legacy_payout_reserved
  from public.reward_payouts rp join public.reward_rounds rr on rr.id=rp.round_id
  where rr.network=v_network and rp.status in ('PENDING','SENDING','FAILED')
    and not exists(select 1 from public.reward_queue_entries q where q.invite_code=rp.invite_code and q.reserved_amount_wei is not null);
  v_reserved := v_reserved + v_legacy_payout_reserved;

  if v_reserved <> p_expected_reserved_before_wei then return jsonb_build_object('reserved',false,'reason','RECALCULATE','reservedExistingWei',v_reserved::text); end if;
  if p_amount_wei > greatest(p_observed_pool_balance_wei-v_reserved,0) then return jsonb_build_object('reserved',false,'reason','RECALCULATE','reservedExistingWei',v_reserved::text,'availableWei',greatest(p_observed_pool_balance_wei-v_reserved,0)::text); end if;

  insert into public.reward_queue_entries(
    invite_code,recipient_wallet,eligibility_check_id,entry_class,network,eligible_at,status,
    reserved_amount_wei,reserved_at,reservation_algorithm_version,reservation_quote_snapshot_id,
    reservation_completion_block,reservation_completion_tx_index,reservation_completion_clause_index,reservation_basis,
    sybil_clearance_id
  ) values (
    v_code,lower(v_invitation.inviter_wallet),v_invitation.eligibility_check_id,v_entry_class,v_network,v_invitation.reward_eligible_at,'AWAITING_CLAIM',
    p_amount_wei,v_now,btrim(p_algorithm_version),p_quote_snapshot_id,v_completion_block,v_completion_tx_index,v_completion_clause_index,
    p_basis || jsonb_build_object(
      'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
      'reservedBeforeWei',v_reserved::text,
      'finalizedBlock',p_finalized_block,
      'sybilV2Enforced',v_sybil_v2_enforced,
      'sybilClearanceId',case when v_sybil_v2_enforced then v_clearance.id::text else null end,
      'sybilVerdict',case when v_sybil_v2_enforced then v_clearance.verdict else null end,
      'sybilAssessmentRevision',case when v_sybil_v2_enforced then v_clearance.assessment_revision else null end
    ),
    case when v_sybil_v2_enforced then v_clearance.id else null end
  ) returning * into v_queue;

  return jsonb_build_object(
    'reserved',true,'reason','RESERVED','inviteCode',v_queue.invite_code,
    'amountWei',v_queue.reserved_amount_wei::text,'reservedAt',v_queue.reserved_at,
    'status',v_queue.status,'completionBlock',v_queue.reservation_completion_block,
    'completionTxIndex',v_queue.reservation_completion_tx_index,
    'completionClauseIndex',v_queue.reservation_completion_clause_index,
    'sybilClearanceId',v_queue.sybil_clearance_id
  );
end;
$$;

create or replace function public.read_sybil_v2_cleared_unreserved_count(
  p_network text,
  p_reward_cohort_round_id bigint,
  p_allocation_receipt_id bigint
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer
  from public.invitations i
  left join public.sybil_v2_referral_assessments a
    on a.invite_code = i.invite_code
  left join public.sybil_v2_reward_clearances c
    on c.invite_code = i.invite_code
   and c.network = lower(btrim(p_network))
   and c.assessment_revision = a.revision
   and c.verdict = a.state
  where i.activation_network = lower(btrim(p_network))
    and i.reward_cohort_round_id = p_reward_cohort_round_id
    and i.reward_funding_allocation_receipt_id = p_allocation_receipt_id
    and i.status = 'COMPLETED'
    and i.reward_status = 'ELIGIBLE'
    and i.reward_eligible_at is not null
    and (
      not public.sybil_v2_enforcement_enabled()
      or (
        a.state in ('CLEAR','WATCH')
        and c.id is not null
      )
    )
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = i.invite_code
        and q.reserved_amount_wei is not null
    )
    and (
      not public.sybil_v2_enforcement_enabled()
      or not exists (
        select 1
        from public.sybil_v2_wallet_restrictions r
        where r.network = i.activation_network
          and r.status = 'ACTIVE'
          and r.wallet_address in (
            lower(i.inviter_wallet),
            lower(i.invitee_wallet)
          )
      )
    )
    and not exists (
      select 1
      from public.reward_reservation_legacy_exclusions x
      where x.invite_code = i.invite_code
    );
$$;

create or replace view public.operator_sybil_v2_temporary_participation_holds
with (security_invoker = true)
as
select
  ('preclaim:' || a.invite_code || ':inviter')::text as id,
  a.network,
  lower(i.inviter_wallet) as wallet_address,
  'PRE_CLAIM_HOLD'::text as restriction_kind,
  a.reason_codes,
  a.evidence_summary,
  a.invite_code as related_invite_code,
  a.updated_at as imposed_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD'
  and i.inviter_wallet is not null

union all

select
  ('preclaim:' || a.invite_code || ':invitee')::text as id,
  a.network,
  lower(i.invitee_wallet) as wallet_address,
  'PRE_CLAIM_HOLD'::text as restriction_kind,
  a.reason_codes,
  a.evidence_summary,
  a.invite_code as related_invite_code,
  a.updated_at as imposed_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD'
  and i.invitee_wallet is not null

union all

select
  ('postpayout:' || r.invite_code || ':recipient')::text as id,
  r.network,
  lower(r.subject_wallet) as wallet_address,
  'POST_PAYOUT_HOLD'::text as restriction_kind,
  r.reason_codes,
  r.evidence_summary,
  r.invite_code as related_invite_code,
  r.updated_at as imposed_at
from public.sybil_v2_post_payout_reviews r
where public.sybil_v2_enforcement_enabled()
  and r.state = 'HOLD';

revoke all on public.operator_sybil_v2_temporary_participation_holds from public, anon, authenticated;
grant select on public.operator_sybil_v2_temporary_participation_holds to service_role;

create or replace function public.enrich_operator_monitor_snapshot_sybil_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_health record;
  v_stale_scan bigint := 0;
  v_stale_assessment bigint := 0;
  v_stale_failure bigint := 0;
  v_claim_ready_without_clearance bigint := 0;
  v_live_assessment_coverage_pct numeric := 100;
  v_extra_alerts jsonb := '[]'::jsonb;
  v_extra_metrics jsonb := '{}'::jsonb;
begin
  if not public.sybil_v2_enforcement_enabled() then
    new.metrics := coalesce(new.metrics,'{}'::jsonb) ||
      jsonb_build_object(
        'sybilV2',
        jsonb_build_object(
          'mode','SHADOW',
          'enforcementEnabled',false
        )
      );
    return new;
  end if;

  select *
  into v_health
  from public.operator_sybil_v2_health h
  where h.network = new.network;

  select count(*)::bigint
  into v_stale_scan
  from public.operator_sybil_v2_scan_candidates c
  where c.network = new.network
    and c.priority_at < clock_timestamp() - interval '15 minutes';

  select count(*)::bigint
  into v_stale_assessment
  from public.operator_sybil_v2_assessment_candidates c
  where c.network = new.network
    and c.priority_at < clock_timestamp() - interval '15 minutes';

  select count(*)::bigint
  into v_stale_failure
  from public.sybil_v2_referral_assessments a
  join public.invitations i on i.invite_code = a.invite_code
  where a.network = new.network
    and a.state = 'ANALYSIS_FAILED'
    and a.updated_at < clock_timestamp() - interval '15 minutes'
    and i.reward_status not in ('PAID','FORFEITED');

  select count(*)::bigint
  into v_claim_ready_without_clearance
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code = q.invite_code
  where q.network = new.network
    and q.status = 'AWAITING_CLAIM'
    and q.sybil_clearance_id is null
    and i.reward_status <> 'PAID'
    and q.reserved_at >= coalesce(
      (
        select cfg.sybil_v2_enforcement_changed_at
        from public.reward_runtime_config cfg
        where cfg.id = 1
          and cfg.sybil_v2_enforcement_enabled is true
      ),
      '-infinity'::timestamptz
    );

  if coalesce(v_health.relevant_referrals,0) > 0 then
    v_live_assessment_coverage_pct := round(
      coalesce(v_health.assessed_referrals,0)::numeric * 100
      / v_health.relevant_referrals::numeric,
      2
    );
  end if;

  v_extra_metrics := jsonb_build_object(
    'sybilV2',
    jsonb_build_object(
      'relevantReferrals', coalesce(v_health.relevant_referrals,0),
      'assessedReferrals', coalesce(v_health.assessed_referrals,0),
      'assessmentCoveragePct', v_live_assessment_coverage_pct,
      'pendingReferrals', coalesce(v_health.pending_referrals,0),
      'failedReferrals', coalesce(v_health.failed_referrals,0),
      'heldReferrals', coalesce(v_health.held_referrals,0),
      'watchReferrals', coalesce(v_health.watch_referrals,0),
      'clearedForRewardReferrals', coalesce(v_health.cleared_for_reward_referrals,0),
      'eligibleWithoutClearance', coalesce(v_health.eligible_without_v2_clearance,0),
      'staleScanBacklog', v_stale_scan,
      'staleAssessmentBacklog', v_stale_assessment,
      'staleFailedAnalysis', v_stale_failure,
      'claimReadyWithoutClearance', v_claim_ready_without_clearance,
      'staleThresholdMinutes', 15
    )
  );

  if v_claim_ready_without_clearance > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_CLAIM_READY_WITHOUT_CLEARANCE',
        'severity', 'CRITICAL',
        'observed', v_claim_ready_without_clearance,
        'message', 'A live reward reached AWAITING_CLAIM without a Sybil v2 clearance.'
      )
    );
  end if;

  if v_stale_scan > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_STALE_SCAN_BACKLOG',
        'severity', 'CRITICAL',
        'observed', v_stale_scan,
        'message', 'One or more live referrals have waited over 15 minutes for required Sybil v2 chain evidence.'
      )
    );
  end if;

  if v_stale_assessment > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_STALE_CLEARANCE_BACKLOG',
        'severity', 'CRITICAL',
        'observed', v_stale_assessment,
        'message', 'One or more reward-eligible referrals have waited over 15 minutes for a current Sybil v2 assessment/clearance.'
      )
    );
  end if;

  if v_stale_failure > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_STALE_ANALYSIS_FAILURE',
        'severity', 'CRITICAL',
        'observed', v_stale_failure,
        'message', 'A live Sybil v2 analysis failure has remained unresolved for over 15 minutes.'
      )
    );
  elsif coalesce(v_health.failed_referrals,0) > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_ANALYSIS_FAILURE',
        'severity', 'WARNING',
        'observed', coalesce(v_health.failed_referrals,0),
        'message', 'A Sybil v2 analysis failed and is waiting for retry.'
      )
    );
  end if;

  if coalesce(v_health.held_referrals,0) > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_OPERATOR_REVIEW_REQUIRED',
        'severity', 'WARNING',
        'observed', coalesce(v_health.held_referrals,0),
        'message', 'One or more Sybil v2 HOLD referrals require operator review.'
      )
    );
  end if;

  new.metrics := coalesce(new.metrics,'{}'::jsonb) || v_extra_metrics;
  new.alerts := coalesce(new.alerts,'[]'::jsonb) || v_extra_alerts;
  new.alert_count := jsonb_array_length(new.alerts);
  new.severity := case
    when new.alerts @> '[{"severity":"CRITICAL"}]'::jsonb then 'CRITICAL'
    when new.alert_count > 0 then 'WARNING'
    else 'NORMAL'
  end;

  return new;
end;
$$;

create or replace function public.enrich_operator_monitor_snapshot_sybil_v2_post_payout()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_post_hold bigint := 0;
  v_post_hold_over_24h bigint := 0;
  v_post_hold_over_48h bigint := 0;
  v_bridge_backlog bigint := 0;
  v_stale_bridge bigint := 0;
  v_extra_alerts jsonb := '[]'::jsonb;
  v_extra_metrics jsonb := '{}'::jsonb;
begin
  if not public.sybil_v2_enforcement_enabled() then
    new.metrics := coalesce(new.metrics,'{}'::jsonb) ||
      jsonb_build_object(
        'sybilV2PostPayout',
        jsonb_build_object(
          'mode','SHADOW',
          'enforcementEnabled',false
        )
      );
    return new;
  end if;

  select count(*)::bigint
  into v_post_hold
  from public.sybil_v2_post_payout_reviews r
  where r.network = new.network
    and r.state = 'HOLD';

  select count(*)::bigint
  into v_post_hold_over_24h
  from public.sybil_v2_post_payout_reviews r
  where r.network = new.network
    and r.state = 'HOLD'
    and r.opened_at < clock_timestamp() - interval '24 hours';

  select count(*)::bigint
  into v_post_hold_over_48h
  from public.sybil_v2_post_payout_reviews r
  where r.network = new.network
    and r.state = 'HOLD'
    and r.opened_at < clock_timestamp() - interval '48 hours';

  select count(*)::bigint
  into v_bridge_backlog
  from public.operator_sybil_v2_post_payout_candidates c
  where c.network = new.network;

  select count(*)::bigint
  into v_stale_bridge
  from public.operator_sybil_v2_post_payout_candidates c
  where c.network = new.network
    and c.checked_at < clock_timestamp() - interval '15 minutes';

  v_extra_metrics := jsonb_build_object(
    'sybilV2PostPayout',
    jsonb_build_object(
      'holdReviews', v_post_hold,
      'holdReviewsOver24h', v_post_hold_over_24h,
      'holdReviewsOver48h', v_post_hold_over_48h,
      'bridgeBacklog', v_bridge_backlog,
      'staleBridgeBacklog', v_stale_bridge,
      'bridgeStaleThresholdMinutes', 15,
      'reviewWarningHours', 24,
      'reviewCriticalHours', 48
    )
  );

  if v_stale_bridge > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_POST_PAYOUT_BRIDGE_STALE',
        'severity', 'CRITICAL',
        'observed', v_stale_bridge,
        'message', 'One or more finalized B3TR observations have waited over 15 minutes to enter the Sybil v2 evidence/review pipeline.'
      )
    );
  end if;

  if v_post_hold > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_POST_PAYOUT_REVIEW_REQUIRED',
        'severity', 'WARNING',
        'observed', v_post_hold,
        'message', 'One or more already-paid reward recipients have new post-payout evidence requiring operator review. Past rewards remain unchanged; future participation is temporarily held.'
      )
    );
  end if;

  if v_post_hold_over_48h > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_POST_PAYOUT_REVIEW_OVER_48H',
        'severity', 'CRITICAL',
        'observed', v_post_hold_over_48h,
        'message', 'A post-payout Sybil v2 HOLD has remained unresolved for over 48 hours.'
      )
    );
  elsif v_post_hold_over_24h > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_POST_PAYOUT_REVIEW_OVER_24H',
        'severity', 'WARNING',
        'observed', v_post_hold_over_24h,
        'message', 'A post-payout Sybil v2 HOLD has remained unresolved for over 24 hours.'
      )
    );
  end if;

  new.metrics := coalesce(new.metrics,'{}'::jsonb) || v_extra_metrics;
  new.alerts := coalesce(new.alerts,'[]'::jsonb) || v_extra_alerts;
  new.alert_count := jsonb_array_length(new.alerts);
  new.severity := case
    when new.alerts @> '[{"severity":"CRITICAL"}]'::jsonb then 'CRITICAL'
    when new.alert_count > 0 then 'WARNING'
    else 'NORMAL'
  end;

  return new;
end;
$$;

create or replace function public.notify_sybil_v2_referral_security_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  if new.state = 'HOLD'
     and (
       tg_op = 'INSERT'
       or old.state is distinct from 'HOLD'
     ) then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_REVIEW_STARTED',
      'preclaim-r' || new.revision::text,
      new.updated_at
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_sybil_v2_post_payout_security_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  if new.state = 'HOLD'
     and (
       tg_op = 'INSERT'
       or old.state is distinct from 'HOLD'
     ) then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_REVIEW_STARTED',
      'postpayout-r' || new.revision::text,
      new.updated_at
    );
  elsif new.state = 'RESTRICTED'
     and (
       tg_op = 'INSERT'
       or old.state is distinct from 'RESTRICTED'
     ) then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_RESTRICTION_CONFIRMED',
      'postpayout-r' || new.revision::text,
      new.updated_at
    );
  end if;

  return new;
end;
$$;

commit;
