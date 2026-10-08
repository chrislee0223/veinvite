-- Centralize all global outstanding-liability consumers before X promotion LIVE rollout.
-- LIVE activation remains blocked by reward_x_promotion_live_activation_interlock.

CREATE OR REPLACE FUNCTION public.commit_reward_reservation(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_expected_reserved_before_wei numeric, p_amount_wei numeric, p_algorithm_version text, p_quote_snapshot_id bigint, p_finalized_block bigint, p_basis jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_invitation public.invitations%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_clearance public.sybil_v2_reward_clearances%rowtype;
  v_existing_settlement public.reward_recovery_settlements%rowtype;
  v_settlement public.reward_recovery_settlements%rowtype;
  v_allocation_receipt public.vebetter_round_allocations%rowtype;
  v_obligation record;
  v_entry_class text;
  v_reserved numeric(78,0) := 0;
  v_legacy_payout_reserved numeric(78,0) := 0;
  v_recovery_balance numeric(78,0) := 0;
  v_offset numeric(78,0) := 0;
  v_net numeric(78,0) := 0;
  v_remaining_offset numeric(78,0) := 0;
  v_take numeric(78,0) := 0;
  v_cohort_committed numeric(78,0) := 0;
  v_expected_cohort_committed numeric(78,0) := 0;
  v_adjustment numeric(78,0) := 0;
  v_budget numeric(78,0) := 0;
  v_completion_block bigint;
  v_completion_tx_index integer;
  v_completion_clause_index integer;
  v_completion_tx_id text;
  v_mainnet_enabled boolean;
  v_emergency_paused boolean;
  v_sybil_v2_enforced boolean := false;
  v_recovery_enabled boolean := false;
  v_now timestamptz := clock_timestamp();
  v_basis jsonb;
begin
  if v_code is null or v_code='' then raise exception 'INVITE_CODE_REQUIRED'; end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then raise exception 'UNSUPPORTED_NETWORK'; end if;
  if p_observed_pool_balance_wei is null or p_observed_pool_balance_wei<0 or p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei) then raise exception 'INVALID_OBSERVED_POOL_BALANCE'; end if;
  if p_expected_reserved_before_wei is null or p_expected_reserved_before_wei<0 or p_expected_reserved_before_wei<>trunc(p_expected_reserved_before_wei) then raise exception 'INVALID_EXPECTED_RESERVED'; end if;
  if p_amount_wei is null or p_amount_wei<=0 or p_amount_wei<>trunc(p_amount_wei) then raise exception 'INVALID_REWARD_AMOUNT'; end if;
  if p_finalized_block is null or p_finalized_block<0 then raise exception 'INVALID_FINALIZED_BLOCK'; end if;
  if p_algorithm_version is null or length(btrim(p_algorithm_version)) not between 1 and 80 then raise exception 'INVALID_ALGORITHM_VERSION'; end if;
  if p_basis is null or jsonb_typeof(p_basis)<>'object' then raise exception 'INVALID_RESERVATION_BASIS'; end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));

  select
    mainnet_funded_rewards_enabled,
    emergency_rewards_paused,
    sybil_v2_enforcement_enabled,
    reward_recovery_enabled
  into
    v_mainnet_enabled,
    v_emergency_paused,
    v_sybil_v2_enforced,
    v_recovery_enabled
  from public.reward_runtime_config
  where id=1;

  if not found then raise exception 'REWARD_RUNTIME_CONFIG_MISSING'; end if;
  if v_emergency_paused then raise exception 'REWARD_RESERVATION_PAUSED'; end if;
  if v_network='mainnet' and not v_mainnet_enabled then raise exception 'REWARD_RESERVATION_DISABLED'; end if;

  -- Preserve the existing global network reservation lock. Recovery also uses
  -- a wallet lock below, always after this lock, so lock ordering is stable.
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_' || v_network,0)
  );

  select * into v_invitation
  from public.invitations i
  where i.invite_code=v_code
  for update;

  if not found
     or v_invitation.activation_network<>v_network
     or v_invitation.status<>'COMPLETED'
     or v_invitation.reward_status<>'ELIGIBLE'
     or v_invitation.reward_eligible_at is null
     or v_invitation.sybil_status<>'CLEAR'
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
    on a.invite_code=c.invite_code
   and a.revision=c.assessment_revision
   and a.state=c.verdict
  where c.invite_code=v_code
    and c.network=v_network
    and c.verdict='CLEAR';

  if v_sybil_v2_enforced and not found then
    return jsonb_build_object('reserved',false,'reason','SYBIL_V2_CLEARANCE_MISSING');
  end if;

  if v_sybil_v2_enforced and exists (
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network=v_network
      and r.status='ACTIVE'
      and r.wallet_address in (
        lower(v_invitation.inviter_wallet),
        lower(v_invitation.invitee_wallet)
      )
  ) then
    return jsonb_build_object('reserved',false,'reason','SYBIL_V2_RESTRICTED');
  end if;

  if exists (
    select 1
    from public.reward_reservation_legacy_exclusions x
    where x.invite_code=v_code
  ) then
    return jsonb_build_object('reserved',false,'reason','LEGACY_EXCLUDED');
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code=v_code
  for update;

  if found then
    if v_queue.reserved_amount_wei is not null then
      return jsonb_build_object(
        'reserved',true,
        'reason','ALREADY_RESERVED',
        'inviteCode',v_queue.invite_code,
        'amountWei',v_queue.reserved_amount_wei::text,
        'reservedAt',v_queue.reserved_at,
        'status',v_queue.status
      );
    end if;
    return jsonb_build_object('reserved',false,'reason','LEGACY_QUEUE_ENTRY');
  end if;

  select * into v_existing_settlement
  from public.reward_recovery_settlements s
  where s.invite_code=v_code
  for update;

  if found then
    return jsonb_build_object(
      'reserved',true,
      'reason','ALREADY_RECOVERY_SETTLED',
      'inviteCode',v_existing_settlement.invite_code,
      'amountWei',v_existing_settlement.net_amount_wei::text,
      'reservedAt',v_existing_settlement.settled_at,
      'status',case
        when v_existing_settlement.net_amount_wei=0 then 'RECOVERY_SETTLED'
        else 'AWAITING_CLAIM'
      end
    );
  end if;

  select
    e.block_number::bigint,
    e.tx_index::integer,
    e.clause_index::integer,
    lower(e.tx_id)
  into
    v_completion_block,
    v_completion_tx_index,
    v_completion_clause_index,
    v_completion_tx_id
  from public.invite_impact_events e
  where e.invite_code=v_code
    and e.network=v_network
    and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
    and e.block_number is not null
    and e.tx_index is not null
    and e.clause_index is not null
  order by e.block_number desc,e.tx_index desc,e.clause_index desc
  limit 1;

  if v_completion_block is null
     or v_completion_tx_index is null
     or v_completion_clause_index is null then
    return jsonb_build_object('reserved',false,'reason','COMPLETION_POSITION_MISSING');
  end if;

  if v_completion_block>p_finalized_block then
    return jsonb_build_object(
      'reserved',false,
      'reason','AWAITING_FINALITY',
      'completionBlock',v_completion_block,
      'finalizedBlock',p_finalized_block
    );
  end if;

  select e.entry_class into v_entry_class
  from public.eligibility_check_events e
  where e.id=v_invitation.eligibility_check_id
    and e.invite_code=v_code
    and e.wallet_address=lower(v_invitation.invitee_wallet)
    and e.network=v_network
    and e.outcome='ELIGIBLE'
    and e.entry_class in ('NEW','RETURNING');

  if v_entry_class not in ('NEW','RETURNING') then
    return jsonb_build_object('reserved',false,'reason','ENTRY_PROOF_MISSING');
  end if;

  -- Use the single authoritative liability reader so reservation-time pool
  -- protection includes any post-base LIVE X promotion obligation exactly
  -- once. With LIVE disabled this is numerically identical to the legacy
  -- queue + legacy-payout calculation.
  v_reserved := public.read_outstanding_reward_liability(
    v_network,
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
  )::numeric;

  if v_reserved<>p_expected_reserved_before_wei then
    return jsonb_build_object(
      'reserved',false,
      'reason','RECALCULATE',
      'reservedExistingWei',v_reserved::text
    );
  end if;

  v_net:=p_amount_wei;

  if v_recovery_enabled then
    if not (p_basis ? 'cohortReservedWei')
       or coalesce(p_basis->>'cohortReservedWei','') !~ '^[0-9]+$' then
      raise exception 'INVALID_EXPECTED_COHORT_COMMITTED';
    end if;

    v_expected_cohort_committed :=
      (p_basis->>'cohortReservedWei')::numeric;

    select * into v_allocation_receipt
    from public.vebetter_round_allocations a
    where a.id=v_invitation.reward_funding_allocation_receipt_id;

    if not found
       or v_allocation_receipt.network<>v_network
       or v_allocation_receipt.vebetter_round_id+1<>
          v_invitation.reward_cohort_round_id then
      raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
    end if;

    v_cohort_committed:=public.read_reward_cohort_committed_wei(
      v_network,
      v_allocation_receipt.app_id,
      v_invitation.reward_cohort_round_id,
      v_allocation_receipt.id
    );

    if v_cohort_committed<>v_expected_cohort_committed then
      return jsonb_build_object(
        'reserved',false,
        'reason','RECALCULATE',
        'cohortCommittedWei',v_cohort_committed::text
      );
    end if;


    perform pg_advisory_xact_lock(
      hashtextextended(
        'veinvite_reward_recovery_' || v_network || '_' ||
        lower(v_invitation.inviter_wallet),
        0
      )
    );

    v_recovery_balance:=public.read_reward_recovery_balance_wei(
      v_network,
      lower(v_invitation.inviter_wallet)
    );
    v_offset:=least(p_amount_wei,v_recovery_balance);
    v_net:=p_amount_wei-v_offset;
  end if;

  -- Preserve the original pool guard for normal users. Recovery users reserve
  -- only the amount that will actually be transferred on-chain.
  if v_net>greatest(p_observed_pool_balance_wei-v_reserved,0) then
    return jsonb_build_object(
      'reserved',false,
      'reason','RECALCULATE',
      'reservedExistingWei',v_reserved::text,
      'availableWei',greatest(p_observed_pool_balance_wei-v_reserved,0)::text
    );
  end if;

  v_basis:=p_basis || jsonb_build_object(
    'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
    'reservedBeforeWei',v_reserved::text,
    'finalizedBlock',p_finalized_block,
    'sybilV2Enforced',v_sybil_v2_enforced,
    'sybilClearanceId',case when v_sybil_v2_enforced then v_clearance.id::text else null end,
    'sybilVerdict',case when v_sybil_v2_enforced then v_clearance.verdict else null end,
    'sybilAssessmentRevision',case when v_sybil_v2_enforced then v_clearance.assessment_revision else null end
  );

  if v_offset>0 then
    if v_completion_tx_id is null
       or v_completion_tx_id !~ '^0x[0-9a-f]{64}$' then
      return jsonb_build_object(
        'reserved',false,
        'reason','COMPLETION_TX_ID_MISSING'
      );
    end if;

    -- Gross remains the cohort pricing commitment. Net remains the actual
    -- transfer liability. This keeps same-cohort pricing deterministic while
    -- ensuring withheld value does not occupy the on-chain payout pool.
    select * into v_allocation_receipt
    from public.vebetter_round_allocations a
    where a.id=v_invitation.reward_funding_allocation_receipt_id;

    if not found
       or v_allocation_receipt.network<>v_network
       or v_allocation_receipt.vebetter_round_id+1<>
          v_invitation.reward_cohort_round_id then
      raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
    end if;

    select coalesce(sum(a.amount_wei),0)
    into v_adjustment
    from public.reward_cohort_funding_adjustments a
    where a.network=v_allocation_receipt.network
      and a.app_id=v_allocation_receipt.app_id
      and a.reward_cohort_round_id=v_invitation.reward_cohort_round_id
      and a.allocation_receipt_id=v_allocation_receipt.id;

    v_budget:=public.read_reward_cohort_effective_budget_wei(v_network,v_allocation_receipt.app_id,v_invitation.reward_cohort_round_id,v_allocation_receipt.id);
    v_cohort_committed:=public.read_reward_cohort_committed_wei(
      v_network,
      v_allocation_receipt.app_id,
      v_invitation.reward_cohort_round_id,
      v_allocation_receipt.id
    );

    if v_cohort_committed+p_amount_wei>v_budget then
      return jsonb_build_object(
        'reserved',false,
        'reason','RECALCULATE',
        'cohortCommittedWei',v_cohort_committed::text,
        'cohortBudgetWei',v_budget::text
      );
    end if;

    insert into public.reward_recovery_settlements(
      network,invite_code,recipient_wallet,settlement_kind,state,
      gross_amount_wei,offset_amount_wei,net_amount_wei,sybil_clearance_id,
      completion_block,completion_tx_index,completion_clause_index,completion_tx_id,
      settled_at,updated_at
    ) values (
      v_network,
      v_code,
      lower(v_invitation.inviter_wallet),
      case when v_net=0 then 'FULL_OFFSET' else 'PARTIAL_OFFSET' end,
      'ACTIVE',
      p_amount_wei,
      v_offset,
      v_net,
      case when v_sybil_v2_enforced then v_clearance.id else null end,
      v_completion_block,
      v_completion_tx_index,
      v_completion_clause_index,
      v_completion_tx_id,
      v_now,
      v_now
    )
    returning * into v_settlement;

    v_remaining_offset:=v_offset;

    for v_obligation in
      with consumed as (
        select
          a.obligation_id,
          coalesce(sum(a.amount_wei),0)::numeric as consumed_wei
        from public.reward_recovery_allocations a
        group by a.obligation_id
      )
      select
        o.id,
        greatest(o.amount_wei-coalesce(c.consumed_wei,0),0)::numeric
          as remaining_wei
      from public.reward_recovery_obligations o
      left join consumed c on c.obligation_id=o.id
      where o.network=v_network
        and o.recipient_wallet=lower(v_invitation.inviter_wallet)
        and o.status='ACTIVE'
        and greatest(o.amount_wei-coalesce(c.consumed_wei,0),0)>0
      order by o.created_at,o.id
    loop
      exit when v_remaining_offset<=0;
      v_take:=least(v_remaining_offset,v_obligation.remaining_wei);

      insert into public.reward_recovery_allocations(
        settlement_id,obligation_id,amount_wei
      ) values (
        v_settlement.id,v_obligation.id,v_take
      );

      v_remaining_offset:=v_remaining_offset-v_take;
    end loop;

    if v_remaining_offset<>0 then
      raise exception 'REWARD_RECOVERY_ALLOCATION_MISMATCH';
    end if;

    v_basis:=v_basis || jsonb_build_object(
      'recoverySettlementId',v_settlement.id::text,
      'grossRewardWei',p_amount_wei::text,
      'recoveryOffsetWei',v_offset::text,
      'netPayableWei',v_net::text
    );
  end if;

  if v_net>0 then
    insert into public.reward_queue_entries(
      invite_code,recipient_wallet,eligibility_check_id,entry_class,network,eligible_at,status,
      reserved_amount_wei,reserved_at,reservation_algorithm_version,reservation_quote_snapshot_id,
      reservation_completion_block,reservation_completion_tx_index,reservation_completion_clause_index,
      reservation_basis,sybil_clearance_id
    ) values (
      v_code,
      lower(v_invitation.inviter_wallet),
      v_invitation.eligibility_check_id,
      v_entry_class,
      v_network,
      v_invitation.reward_eligible_at,
      'AWAITING_CLAIM',
      v_net,
      v_now,
      btrim(p_algorithm_version),
      p_quote_snapshot_id,
      v_completion_block,
      v_completion_tx_index,
      v_completion_clause_index,
      v_basis,
      case when v_sybil_v2_enforced then v_clearance.id else null end
    )
    returning * into v_queue;

    return jsonb_build_object(
      'reserved',true,
      'reason',case when v_offset>0 then 'RECOVERY_PARTIAL_RESERVED' else 'RESERVED' end,
      'inviteCode',v_queue.invite_code,
      'amountWei',v_queue.reserved_amount_wei::text,
      'reservedAt',v_queue.reserved_at,
      'status',v_queue.status,
      'completionBlock',v_queue.reservation_completion_block,
      'completionTxIndex',v_queue.reservation_completion_tx_index,
      'completionClauseIndex',v_queue.reservation_completion_clause_index,
      'sybilClearanceId',v_queue.sybil_clearance_id
    );
  end if;

  if v_offset<=0 or v_settlement.id is null then
    raise exception 'REWARD_RECOVERY_FULL_OFFSET_STATE_INVALID';
  end if;

  -- Full offset has no token transfer, queue row, payout or receipt. It still
  -- settles the valid referral, releases the slot and records one bell-only
  -- policy notice.
  update public.invitations i
  set slot_released_at=coalesce(i.slot_released_at,v_now)
  where i.invite_code=v_code
    and i.status='COMPLETED';

  insert into public.invite_notification_history(
    inviter_wallet,recipient_wallet,invite_code,kind,stage,event_at,
    reward_amount_wei,dapp_progress,collapsed_progress,friend_wallet,dedupe_key
  ) values (
    lower(v_invitation.inviter_wallet),
    lower(v_invitation.inviter_wallet),
    v_code,
    'REWARD_ADJUSTED',
    4,
    v_now,
    null,
    null,
    false,
    lower(v_invitation.invitee_wallet),
    'reward-recovery-adjusted:' || v_settlement.id::text
  )
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object(
    'reserved',true,
    'reason','RECOVERY_FULLY_SETTLED',
    'inviteCode',v_code,
    'amountWei','0',
    'reservedAt',v_now,
    'status','RECOVERY_SETTLED',
    'completionBlock',v_completion_block,
    'completionTxIndex',v_completion_tx_index,
    'completionClauseIndex',v_completion_clause_index,
    'sybilClearanceId',case when v_sybil_v2_enforced then v_clearance.id else null end
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.prepare_reward_cohort_batch(p_network text, p_app_id text, p_pool_balance_wei numeric, p_allocation_receipt_id bigint, p_expected_completions integer, p_stress_completions integer, p_reward_per_invite_wei numeric, p_algorithm_version text, p_pipeline_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_batch_limit constant integer := 25;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_epoch public.reward_budget_epochs%rowtype;
  v_reserved_existing numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
  v_candidate_codes text[] := array[]::text[];
  v_eligible_count integer := 0;
  v_round_id bigint;
  v_distributable numeric(78,0) := 0;
  v_remainder numeric(78,0) := 0;
  v_payout_count integer := 0;
  v_assigned_count integer := 0;
  v_epoch_created boolean := false;
  v_now timestamptz := now();
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));
  p_algorithm_version := btrim(p_algorithm_version);

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_app_id <> v_veinvite_app_id then
    raise exception 'cohort rewards can only target the VeInvite app';
  end if;
  if p_pool_balance_wei is null or p_pool_balance_wei < 0
     or p_pool_balance_wei <> trunc(p_pool_balance_wei) then
    raise exception 'pool balance must be a non-negative integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_predictive_reward_' || p_network || '_' || p_app_id,0)
  );

  if exists(
    select 1 from public.reward_rounds rr
    where rr.network = p_network and rr.app_id = p_app_id
      and rr.status in ('CREATED','PAYING')
      and rr.broadcast_confirmed_at is null
  ) then
    raise exception 'Finish the current reward round before preparing another one';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id = p_allocation_receipt_id for share;

  if not found or v_receipt.network <> p_network or v_receipt.app_id <> p_app_id then
    raise exception 'VeBetter allocation receipt does not match the active reward pool';
  end if;

  -- Keep batch pool protection aligned with the same authority used by
  -- forecasting and reservation commit. This includes post-base LIVE X
  -- promotion liability while remaining a no-op before LIVE activation.
  v_reserved_existing := public.read_outstanding_reward_liability(
    p_network,
    p_app_id
  )::numeric;

  if v_reserved_existing > p_pool_balance_wei then
    raise exception 'reserved reward liability exceeds the observed reward pool';
  end if;

  select * into v_epoch
  from public.reward_budget_epochs e
  where e.allocation_receipt_id = v_receipt.id;

  if not found then
    insert into public.reward_budget_epochs(
      network,app_id,allocation_receipt_id,vebetter_round_id,
      allocation_rewards_wei,opening_pool_balance_wei,opening_reserved_wei,
      expected_completions,stress_completions,reward_per_invite_wei,
      algorithm_version,pipeline_snapshot
    ) values (
      p_network,p_app_id,v_receipt.id,v_receipt.vebetter_round_id,
      v_receipt.rewards_allocation_amount_wei,p_pool_balance_wei,v_reserved_existing,
      greatest(p_expected_completions,0),greatest(p_stress_completions,1),
      greatest(p_reward_per_invite_wei,0),p_algorithm_version,
      coalesce(p_pipeline_snapshot,'{}'::jsonb)
    ) returning * into v_epoch;
    v_epoch_created := true;
  end if;

  select coalesce(array_agg(c.invite_code order by c.claim_requested_at,c.invite_code),array[]::text[])
  into v_candidate_codes
  from (
    select q.invite_code,q.claim_requested_at
    from public.reward_queue_entries q
    join public.invitations i on i.invite_code = q.invite_code
    where q.network = p_network and q.status = 'QUEUED'
      and q.assigned_round_id is null and q.claim_requested_at is not null
      and q.claim_requested_by_wallet = q.recipient_wallet
      and q.reserved_amount_wei is not null and q.reserved_amount_wei > 0
      and q.reserved_at is not null
      and i.reward_funding_allocation_receipt_id = v_receipt.id
      and i.reward_cohort_round_id = v_receipt.vebetter_round_id + 1
      and i.status = 'COMPLETED' and i.reward_status = 'ELIGIBLE'
      and i.sybil_status = 'CLEAR' and lower(i.inviter_wallet) = q.recipient_wallet
      and not exists (
        select 1 from public.reward_payouts rp where rp.invite_code = q.invite_code
      )
    order by q.claim_requested_at,q.invite_code
    limit v_batch_limit
    for update of q,i
  ) c;

  v_eligible_count := coalesce(cardinality(v_candidate_codes),0);
  if v_eligible_count = 0 then
    return jsonb_build_object(
      'epochId',v_epoch.id,'roundId',null,'epochCreated',v_epoch_created,
      'reason','NO_CLAIMED_REWARDS'
    );
  end if;

  select coalesce(sum(q.reserved_amount_wei),0) into v_distributable
  from public.reward_queue_entries q
  where q.invite_code = any(v_candidate_codes);

  if v_distributable <= 0 or v_distributable > p_pool_balance_wei then
    raise exception 'claimed reward batch exceeds the observed reward pool';
  end if;
  v_remainder := p_pool_balance_wei - v_distributable;

  insert into public.reward_rounds(
    network,app_id,status,observed_pool_balance_wei,reserved_before_round_wei,
    distributable_wei,eligible_count,per_reward_wei,remainder_wei,reward_budget_epoch_id
  ) values (
    p_network,p_app_id,'CREATED',p_pool_balance_wei,v_reserved_existing,
    v_distributable,v_eligible_count,0,v_remainder,v_epoch.id
  ) returning id into v_round_id;

  insert into public.reward_payouts(round_id,invite_code,recipient_wallet,amount_wei,status)
  select v_round_id,q.invite_code,q.recipient_wallet,q.reserved_amount_wei,'PENDING'
  from public.reward_queue_entries q
  where q.invite_code = any(v_candidate_codes)
    and q.status = 'QUEUED' and q.assigned_round_id is null
  order by q.claim_requested_at,q.invite_code;
  get diagnostics v_payout_count = row_count;

  if v_payout_count <> v_eligible_count then
    raise exception 'reward payout count does not match claimed reservation count';
  end if;

  update public.reward_queue_entries q
  set status = 'ASSIGNED',assigned_round_id = v_round_id,assigned_at = v_now
  where q.invite_code = any(v_candidate_codes)
    and q.status = 'QUEUED' and q.assigned_round_id is null;
  get diagnostics v_assigned_count = row_count;

  if v_assigned_count <> v_eligible_count then
    raise exception 'reward queue assignment count does not match claimed reservation count';
  end if;

  return jsonb_build_object(
    'epochId',v_epoch.id,'roundId',v_round_id,'epochCreated',v_epoch_created,
    'reason','BATCH_PREPARED','recipientCount',v_eligible_count,
    'distributableWei',v_distributable::text,'remainingPoolWei',v_remainder::text,
    'amountMode','PER_INVITATION_FIXED_RESERVATION',
    'allocationReceiptId',v_receipt.id,
    'rewardCohortRoundId',v_receipt.vebetter_round_id + 1
  );
end;
$function$


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

  -- One global liability authority prevents forecast availability from
  -- diverging from the reservation/payout guards after a base payout leaves
  -- an X promotion amount held in the pool.
  v_reserved := public.read_outstanding_reward_liability(
    p_network,
    p_app_id
  )::numeric;

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
$function$


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
      'fundingAdjustmentWei','0','reserveNetFlowWei','0','designatedBudgetWei','0',
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

  -- Use the global outstanding liability authority here as well so
  -- cohort planning, public estimates and reservation-time checks agree on
  -- post-base X promotion obligations.
  v_reserved := public.read_outstanding_reward_liability(
    p_network,
    p_app_id
  )::numeric;

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

  v_designated := public.read_reward_cohort_effective_budget_wei(p_network,p_app_id,v_cohort_round,v_receipt.id);

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
    'reserveNetFlowWei',public.read_reward_boost_reserve_cohort_net_flow_wei(p_network,p_app_id,v_cohort_round,v_receipt.id)::text,
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
