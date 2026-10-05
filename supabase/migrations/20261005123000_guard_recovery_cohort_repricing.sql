begin;

-- When recovery is enabled a FULL_OFFSET changes gross cohort commitment
-- without changing actual outstanding payout liability. Two overlapping
-- reservation sweeps could otherwise share the same liability snapshot while
-- the second quote was priced before the first gross commitment. Require the
-- cohort commitment observed by predictive planning to still match under the
-- reservation lock; stale quotes use the existing RECALCULATE path.
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

  -- Actual pool liability remains NET-only. This is intentionally unchanged
  -- for wallets without recovery and prevents a withheld amount from reducing
  -- funds available for other legitimate users.
  select coalesce(sum(q.reserved_amount_wei),0)
  into v_reserved
  from public.reward_queue_entries q
  where q.network=v_network
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1
      from public.reward_payouts paid
      where paid.invite_code=q.invite_code
        and paid.status='PAID'
    );

  select coalesce(sum(rp.amount_wei),0)
  into v_legacy_payout_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  where rr.network=v_network
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code=rp.invite_code
        and q.reserved_amount_wei is not null
    );

  v_reserved:=v_reserved+v_legacy_payout_reserved;

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

    v_budget:=v_allocation_receipt.rewards_allocation_amount_wei+v_adjustment;
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
;


-- A recovery-settled referral that later becomes restricted/invalidated must
-- release its withheld gross commitment immediately so legitimate users are
-- not priced against an invalid referral.
CREATE OR REPLACE FUNCTION public.read_reward_cohort_committed_wei(p_network text, p_app_id text, p_reward_cohort_round_id bigint, p_allocation_receipt_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_queue_committed numeric(78,0) := 0;
  v_offset_committed numeric(78,0) := 0;
begin
  p_network:=lower(btrim(p_network));
  p_app_id:=lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_reward_cohort_round_id is null or p_reward_cohort_round_id<1 then
    raise exception 'invalid reward cohort round';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id=p_allocation_receipt_id
    and a.network=p_network
    and a.app_id=p_app_id;

  if not found
     or v_receipt.vebetter_round_id+1<>p_reward_cohort_round_id then
    raise exception 'allocation receipt does not fund the requested reward cohort';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_queue_committed
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code=q.invite_code
  where q.network=p_network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=p_reward_cohort_round_id
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');

  select coalesce(sum(s.offset_amount_wei),0)
  into v_offset_committed
  from public.reward_recovery_settlements s
  join public.invitations i on i.invite_code=s.invite_code
  where s.network=p_network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=p_reward_cohort_round_id
    and not public.is_sybil_v2_referral_invalidated(
      s.invite_code,
      p_network
    )
    and not exists (
      select 1
      from public.reward_recovery_obligations o
      where o.source_settlement_id=s.id
        and o.status='ACTIVE'
    );

  return v_queue_committed+v_offset_committed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_reward_queue_cohort_budget()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_invitation public.invitations%rowtype;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_adjustment numeric(78,0) := 0;
  v_existing_queue numeric(78,0) := 0;
  v_existing_offset numeric(78,0) := 0;
  v_current_offset numeric(78,0) := 0;
  v_budget numeric(78,0) := 0;
begin
  if new.reserved_amount_wei is null or new.status='CANCELLED' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_' || new.network,0)
  );

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found
     or v_invitation.reward_cohort_round_id is null
     or v_invitation.reward_funding_allocation_receipt_id is null then
    raise exception 'REWARD_COHORT_BINDING_REQUIRED';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id=v_invitation.reward_funding_allocation_receipt_id;

  if not found
     or v_receipt.network<>new.network
     or v_receipt.vebetter_round_id+1<>v_invitation.reward_cohort_round_id then
    raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
  end if;

  select coalesce(sum(a.amount_wei),0)
  into v_adjustment
  from public.reward_cohort_funding_adjustments a
  where a.network=v_receipt.network
    and a.app_id=v_receipt.app_id
    and a.reward_cohort_round_id=v_invitation.reward_cohort_round_id
    and a.allocation_receipt_id=v_receipt.id;

  v_budget:=v_receipt.rewards_allocation_amount_wei+v_adjustment;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_existing_queue
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code=q.invite_code
  where q.network=new.network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=v_invitation.reward_cohort_round_id
    and q.invite_code<>new.invite_code
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');

  select coalesce(sum(s.offset_amount_wei),0)
  into v_existing_offset
  from public.reward_recovery_settlements s
  join public.invitations i on i.invite_code=s.invite_code
  where s.network=new.network
    and s.invite_code<>new.invite_code
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=v_invitation.reward_cohort_round_id
    and not public.is_sybil_v2_referral_invalidated(
      s.invite_code,
      new.network
    )
    and not exists (
      select 1
      from public.reward_recovery_obligations o
      where o.source_settlement_id=s.id
        and o.status='ACTIVE'
    );

  select coalesce(s.offset_amount_wei,0)
  into v_current_offset
  from public.reward_recovery_settlements s
  where s.invite_code=new.invite_code
    and s.network=new.network
    and not public.is_sybil_v2_referral_invalidated(
      s.invite_code,
      new.network
    )
    and not exists (
      select 1
      from public.reward_recovery_obligations o
      where o.source_settlement_id=s.id
        and o.status='ACTIVE'
    );

  if not found then
    v_current_offset:=0;
  end if;

  if v_existing_queue+v_existing_offset+
     new.reserved_amount_wei+v_current_offset>v_budget then
    raise exception 'REWARD_COHORT_BUDGET_EXCEEDED';
  end if;

  return new;
end;
$function$
;

-- Referral achievement and token settlement are separate. A partial recovery
-- settlement is a valid referral achievement immediately; until the positive
-- net transfer finalizes it contributes zero paid B3TR. Once a receipt exists,
-- the paid branch becomes authoritative without double-counting the referral.
CREATE OR REPLACE FUNCTION public.get_lifetime_recognized_referral_ranking_v3_internal(p_network text, p_max_block bigint DEFAULT NULL::bigint)
 RETURNS TABLE(rank_position bigint, wallet_address text, completed_referrals bigint, total_reward_wei numeric, reached_count_block bigint, reached_count_tx_index integer, reached_count_clause_index integer, reached_count_tx_id text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with parameters as (
    select lower(btrim(p_network)) as network
  ),
  paid_referrals as (
    select
      lower(btrim(r.recipient_wallet)) as wallet_address,
      r.invite_code,
      r.amount_wei::numeric as amount_wei,
      q.reservation_completion_block as completion_block,
      q.reservation_completion_tx_index as completion_tx_index,
      q.reservation_completion_clause_index as completion_clause_index,
      lower(btrim(s.tx_id)) as proof_tx_id
    from public.reward_receipts r
    join public.reward_payout_transaction_settlements s
      on s.id=r.settlement_id
    join public.reward_queue_entries q
      on q.invite_code=r.invite_code
     and lower(btrim(q.recipient_wallet))=lower(btrim(r.recipient_wallet))
    cross join parameters p
    where lower(btrim(r.network))=p.network
      and lower(btrim(s.network))=p.network
      and lower(btrim(q.network))=p.network
      and r.amount_wei>0
      and q.reservation_completion_block is not null
      and q.reservation_completion_tx_index is not null
      and q.reservation_completion_clause_index is not null
      and (
        p_max_block is null
        or (
          s.block_number<=p_max_block
          and q.reservation_completion_block<=p_max_block
        )
      )
      and not public.is_analytics_excluded_wallet(r.recipient_wallet)
      and not public.is_analytics_excluded_invite_code(r.invite_code)
      and not public.is_sybil_v2_referral_invalidated(r.invite_code,p.network)
  ),
  full_offset_referrals as (
    select
      lower(btrim(s.recipient_wallet)) as wallet_address,
      s.invite_code,
      0::numeric as amount_wei,
      s.completion_block,
      s.completion_tx_index,
      s.completion_clause_index,
      lower(btrim(s.completion_tx_id)) as proof_tx_id
    from public.reward_recovery_settlements s
    cross join parameters p
    where s.network=p.network
      and s.settlement_kind='FULL_OFFSET'
      and s.net_amount_wei=0
      and (
        p_max_block is null
        or s.completion_block<=p_max_block
      )
      and not public.is_analytics_excluded_wallet(s.recipient_wallet)
      and not public.is_analytics_excluded_invite_code(s.invite_code)
      and not public.is_sybil_v2_referral_invalidated(s.invite_code,p.network)
  ),
  partial_unpaid_referrals as (
    select
      lower(btrim(s.recipient_wallet)) as wallet_address,
      s.invite_code,
      0::numeric as amount_wei,
      s.completion_block,
      s.completion_tx_index,
      s.completion_clause_index,
      lower(btrim(s.completion_tx_id)) as proof_tx_id
    from public.reward_recovery_settlements s
    cross join parameters p
    where s.network=p.network
      and s.settlement_kind='PARTIAL_OFFSET'
      and s.net_amount_wei>0
      and (
        p_max_block is null
        or s.completion_block<=p_max_block
      )
      and not public.is_analytics_excluded_wallet(s.recipient_wallet)
      and not public.is_analytics_excluded_invite_code(s.invite_code)
      and not public.is_sybil_v2_referral_invalidated(s.invite_code,p.network)
      and not exists (
        select 1
        from public.reward_receipts r
        where r.network=s.network
          and r.invite_code=s.invite_code
          and lower(r.recipient_wallet)=lower(s.recipient_wallet)
      )
  ),
  recognized as (
    select * from paid_referrals
    union all
    select * from full_offset_referrals
    union all
    select * from partial_unpaid_referrals
  ),
  deduped as (
    select distinct on (wallet_address,invite_code)
      wallet_address,invite_code,amount_wei,
      completion_block,completion_tx_index,completion_clause_index,proof_tx_id
    from recognized
    order by
      wallet_address,invite_code,
      completion_block asc,completion_tx_index asc,completion_clause_index asc,
      proof_tx_id asc
  ),
  totals as (
    select
      wallet_address,
      count(*)::bigint as completed_referrals,
      coalesce(sum(amount_wei),0)::numeric as total_reward_wei
    from deduped
    group by wallet_address
  ),
  reached as (
    select distinct on (wallet_address)
      wallet_address,
      completion_block as reached_count_block,
      completion_tx_index as reached_count_tx_index,
      completion_clause_index as reached_count_clause_index,
      proof_tx_id as reached_count_tx_id
    from deduped
    order by
      wallet_address,
      completion_block desc,
      completion_tx_index desc,
      completion_clause_index desc,
      invite_code desc
  ),
  ranked as (
    select
      row_number() over (
        order by
          t.completed_referrals desc,
          r.reached_count_block asc,
          r.reached_count_tx_index asc,
          r.reached_count_clause_index asc,
          t.wallet_address asc
      )::bigint as rank_position,
      t.wallet_address,
      t.completed_referrals,
      t.total_reward_wei,
      r.reached_count_block,
      r.reached_count_tx_index,
      r.reached_count_clause_index,
      r.reached_count_tx_id
    from totals t
    join reached r using(wallet_address)
  )
  select * from ranked order by rank_position;
$function$
;

-- The public activation metric follows the same achievement semantics: any
-- valid recovery settlement (full or partial) counts as activated, while the
-- outer invalidation filter still removes later Sybil referrals.
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
$function$
;

-- Full offsets have no claimable balance. Keep the internal operator
-- "currently eligible" count from treating them as unpaid rewards.
create or replace view public.operator_analytics_overview as
 SELECT ( SELECT count(*) AS count
           FROM invitations i
          WHERE ((NOT is_analytics_excluded_wallet(i.inviter_wallet)) AND (NOT is_analytics_excluded_wallet(i.invitee_wallet)))) AS total_invitations,
    ( SELECT count(DISTINCT lower(btrim(i.inviter_wallet))) AS count
           FROM invitations i
          WHERE ((lower(btrim(i.inviter_wallet)) ~ '^0x[0-9a-f]{40}$'::text) AND (NOT is_analytics_excluded_wallet(i.inviter_wallet)) AND (NOT is_analytics_excluded_wallet(i.invitee_wallet)))) AS unique_inviters,
    ( SELECT count(*) AS count
           FROM invitations i
          WHERE ((i.eligibility_check_id IS NOT NULL) AND (i.invitee_wallet IS NOT NULL) AND (i.activated_at IS NOT NULL) AND (NOT is_analytics_excluded_wallet(i.inviter_wallet)) AND (NOT is_analytics_excluded_wallet(i.invitee_wallet)))) AS claimed_invitations,
    ( SELECT count(*) AS count
           FROM invitations i
          WHERE ((i.eligibility_check_id IS NOT NULL) AND (i.status = 'COMPLETED'::text) AND (i.apps_completed >= 3) AND (i.apps_completed_block IS NOT NULL) AND (i.vot3_converted IS TRUE) AND (i.vot3_converted_block IS NOT NULL) AND (i.vote_completed IS TRUE) AND (i.vote_completed_block IS NOT NULL) AND (NOT is_analytics_excluded_wallet(i.inviter_wallet)) AND (NOT is_analytics_excluded_wallet(i.invitee_wallet)))) AS completed_referrals,
    ( SELECT count(*) AS count
           FROM invitations i
          WHERE ((i.eligibility_check_id IS NOT NULL)
            AND (i.reward_status = 'ELIGIBLE'::text)
            AND (NOT is_analytics_excluded_wallet(i.inviter_wallet))
            AND (NOT is_analytics_excluded_wallet(i.invitee_wallet))
            AND (NOT (EXISTS (
              SELECT 1
              FROM reward_recovery_settlements s
              WHERE s.invite_code = i.invite_code
                AND s.settlement_kind = 'FULL_OFFSET'::text
                AND s.net_amount_wei = (0)::numeric
            ))))) AS currently_eligible_referrals,
    ( SELECT count(DISTINCT r.invite_code) AS count
           FROM reward_receipts r
          WHERE ((NOT is_analytics_excluded_wallet(r.recipient_wallet)) AND (NOT is_analytics_excluded_invite_code(r.invite_code)))) AS paid_referrals,
    ( SELECT COALESCE(sum(r.amount_wei), (0)::numeric) AS "coalesce"
           FROM reward_receipts r
          WHERE ((NOT is_analytics_excluded_wallet(r.recipient_wallet)) AND (NOT is_analytics_excluded_invite_code(r.invite_code)))) AS total_veinvite_reward_wei,
    ( SELECT count(*) AS count
           FROM invite_impact_events e
          WHERE ((e.event_type = 'DAPP_REWARD'::text) AND (NOT is_analytics_excluded_wallet(e.wallet_address)) AND (NOT is_analytics_excluded_invite_code(e.invite_code)))) AS qualifying_dapp_reward_events,
    ( SELECT COALESCE(sum((e.amount_wei)::numeric), (0)::numeric) AS "coalesce"
           FROM invite_impact_events e
          WHERE ((e.event_type = 'DAPP_REWARD'::text) AND (NOT is_analytics_excluded_wallet(e.wallet_address)) AND (NOT is_analytics_excluded_invite_code(e.invite_code)))) AS total_qualifying_dapp_reward_wei,
    ( SELECT count(*) AS count
           FROM invitations i
          WHERE ((i.eligibility_check_id IS NOT NULL) AND (i.sybil_status = ANY (ARRAY['REVIEW'::text, 'BLOCKED'::text])) AND (NOT is_analytics_excluded_wallet(i.inviter_wallet)) AND (NOT is_analytics_excluded_wallet(i.invitee_wallet)))) AS flagged_referrals,
    GREATEST(( SELECT max(i.updated_at) AS max
           FROM invitations i
          WHERE ((NOT is_analytics_excluded_wallet(i.inviter_wallet)) AND (NOT is_analytics_excluded_wallet(i.invitee_wallet)))), ( SELECT max(e.detected_at) AS max
           FROM invite_impact_events e
          WHERE ((NOT is_analytics_excluded_wallet(e.wallet_address)) AND (NOT is_analytics_excluded_invite_code(e.invite_code)))), ( SELECT max(r.created_at) AS max
           FROM reward_receipts r
          WHERE ((NOT is_analytics_excluded_wallet(r.recipient_wallet)) AND (NOT is_analytics_excluded_invite_code(r.invite_code))))) AS latest_recorded_activity_at;;

commit;
