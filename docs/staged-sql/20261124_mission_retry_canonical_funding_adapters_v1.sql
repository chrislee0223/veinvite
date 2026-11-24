-- STAGED ONLY, NEVER APPLY IN PRODUCTION YET.
-- Core canonical payment/accounting context adapters, captured from actual
-- production function definitions on 2026-11-24. Run only with a reviewed
-- full eligibility/Sybil/identity cutover; the existing retry promotion guard
-- remains intentionally closed. No payout authorization is added here.
-- Do not apply individual definitions outside this transaction.
BEGIN;
DO $snapshot_guard$
BEGIN
  IF md5(pg_get_functiondef('public.commit_reward_reservation(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)'::regprocedure)) IS DISTINCT FROM '388a984e1e9e2be591ccf67a26af9660' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: commit_reward_reservation(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)';
  END IF;
  IF md5(pg_get_functiondef('commit_reward_shared_pool_v1(text,text,numeric,timestamp with time zone,bigint)'::regprocedure)) IS DISTINCT FROM '699fa820e4e8a2e8055e82ec40422942' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: commit_reward_shared_pool_v1(text,text,numeric,timestamp with time zone,bigint)';
  END IF;
  IF md5(pg_get_functiondef('public.create_reward_x_promotion_live_split_from_queue()'::regprocedure)) IS DISTINCT FROM '8b9666d9aa8d8fb4ec47609925e1f0f4' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: create_reward_x_promotion_live_split_from_queue()';
  END IF;
  IF md5(pg_get_functiondef('public.enforce_reward_queue_cohort_budget()'::regprocedure)) IS DISTINCT FROM 'c15bbb7b653842ae6a68ef34798c5393' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: enforce_reward_queue_cohort_budget()';
  END IF;
  IF md5(pg_get_functiondef('public.read_reward_cohort_committed_wei(text,text,bigint,bigint)'::regprocedure)) IS DISTINCT FROM '3eaec379df305908989a47c4033ca139' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: read_reward_cohort_committed_wei(text,text,bigint,bigint)';
  END IF;
  IF md5(pg_get_functiondef('read_reward_reservation_candidates_v2(text,integer)'::regprocedure)) IS DISTINCT FROM 'a9a622b3054c27177ce2e6778ab78463' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: read_reward_reservation_candidates_v2(text,integer)';
  END IF;
  IF md5(pg_get_functiondef('public.validate_reward_x_promotion_split()'::regprocedure)) IS DISTINCT FROM '9715c0609bedfe180d85599396cf4685' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: validate_reward_x_promotion_split()';
  END IF;
END;
$snapshot_guard$;

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
  v_elastic_self_escrow numeric(78,0) := 0;
  v_spendable_wei numeric(78,0) := 0;
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
  v_shared_pool_active boolean := false;
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
  select coalesce((select s.enabled from reward_admission_bridge.shared_pool_settings s where s.id=1),false)
    into v_shared_pool_active;
  if p_algorithm_version='shared-pool-v1' and not v_shared_pool_active then
    raise exception 'SHARED_POOL_ALGORITHM_NOT_ENABLED';
  end if;
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

  -- Keep the existing eligibility, emergency-pause, queue, recovery and
  -- security gates. Only the funding context is adapted.
  if exists(select 1 from public.read_effective_mission_reward_funding_v1(v_code,v_network) f
    where f.attempt_id is not null) then
    -- No retired pricing algorithm may reserve a retry against an old cohort.
    if p_algorithm_version IS DISTINCT FROM 'shared-pool-v1' then
      return jsonb_build_object('reserved',false,'reason','RETRY_REQUIRES_SHARED_POOL');
    end if;
    select f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
    into v_invitation.reward_cohort_round_id,v_invitation.reward_funding_allocation_receipt_id
    from public.read_effective_mission_reward_funding_v1(v_code,v_network) f;
    if v_invitation.reward_cohort_round_id is null
      or v_invitation.reward_funding_allocation_receipt_id is null then
      return jsonb_build_object('reserved',false,'reason','FUNDING_BINDING_MISSING');
    end if;
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

  -- For a retry, the immutable vote transaction determines completion
  -- order. Never select an event from the original mission.
  if exists(select 1 from public.read_effective_mission_reward_funding_v1(v_code,v_network) f
    where f.attempt_id is not null) then
    select f.completion_block,f.completion_tx_index,f.completion_clause_index,f.completion_tx_id
    into v_completion_block,v_completion_tx_index,v_completion_clause_index,v_completion_tx_id
    from public.read_effective_mission_reward_funding_v1(v_code,v_network) f;
    -- A clearance for the original attempt must not authorize a later vote.
    if v_clearance.id is null or v_clearance.evidence_cutoff_block is null
      or v_clearance.evidence_cutoff_block<v_completion_block then
      return jsonb_build_object('reserved',false,'reason','RETRY_CLEARANCE_NOT_CURRENT');
    end if;
  else
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
  end if;

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
  -- A future cohort's still-unspent allocation is included in the global
  -- reserved amount. The existing canonical signer must release that SAME
  -- cohort's own escrow for the exact reservation being converted.
  -- All other payouts and older cohorts still use the original guard.
  IF p_algorithm_version='elastic-closed-cohort-v1' THEN
    IF coalesce(p_basis->'elasticClosure'->>'policy','')<>'elastic-closed-cohort-v1'
       OR v_invitation.reward_cohort_round_id IS NULL
       OR v_invitation.reward_funding_allocation_receipt_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM reward_admission_bridge.elastic_settlement_settings e
         WHERE e.id=1 AND e.enabled AND e.allow_protected_partial_settlement
           AND v_invitation.activated_at>=e.rollout_not_before
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.vebetter_round_allocations a
         JOIN reward_admission_bridge.elastic_settlement_settings e ON e.id=1
         WHERE a.network=v_network
           AND a.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
           AND a.vebetter_round_id=v_invitation.reward_cohort_round_id
           AND a.observed_at+make_interval(hours=>e.close_grace_hours)
               <=clock_timestamp()
       )
    THEN RAISE EXCEPTION 'ELASTIC_CANONICAL_SELF_ESCROW_AUTHORITY_MISSING';
    END IF;
    v_elastic_self_escrow :=
      public.read_reward_elastic_contingent_scope_liability_wei_v1(
        v_network,
        '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
        v_invitation.reward_cohort_round_id,
        v_invitation.reward_funding_allocation_receipt_id
      );
    IF v_elastic_self_escrow<p_amount_wei THEN
      RETURN jsonb_build_object(
        'reserved',false,'reason','RECALCULATE',
        'remainingOwnEscrowWei',v_elastic_self_escrow::text);
    END IF;
  END IF;
  -- GLOBAL insolvency is never bypassed, even for a future elastic cohort.
  v_spendable_wei:=greatest(
    p_observed_pool_balance_wei-v_reserved+v_elastic_self_escrow,0);
  if p_observed_pool_balance_wei<v_reserved OR v_net>v_spendable_wei then
    return jsonb_build_object(
      'reserved',false,
      'reason','RECALCULATE',
      'reservedExistingWei',v_reserved::text,
      'availableWei',v_spendable_wei::text
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

    if p_algorithm_version<>'shared-pool-v1' and v_cohort_committed+p_amount_wei>v_budget then
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
$function$;

CREATE OR REPLACE FUNCTION public.commit_reward_shared_pool_v1(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_observed_at timestamp with time zone, p_finalized_block bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_code text:=upper(btrim(coalesce(p_invite_code,'')));
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_inv public.invitations%rowtype;
 v_alloc public.vebetter_round_allocations%rowtype;
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_candidates bigint;
 v_legacy_candidates bigint;
 v_candidate_present boolean;
 v_reserved numeric(78,0);
 v_headroom numeric(78,0);
 v_x_budget numeric(78,0);
 v_quote numeric(78,0);
 v_cohort_reserved numeric(78,0);
 v_basis jsonb;
 v_result jsonb;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
    OR v_code !~ '^[A-HJ-NP-Z2-9]{7}$'
    OR p_observed_pool_balance_wei IS NULL OR p_observed_pool_balance_wei<0
    OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
    OR p_observed_at IS NULL
    OR p_observed_at<clock_timestamp()-interval '120 seconds'
    OR p_observed_at>clock_timestamp()+interval '10 seconds'
    OR p_finalized_block IS NULL OR p_finalized_block<1
 THEN RAISE EXCEPTION 'SHARED_POOL_INPUT_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
    WHERE s.id=1 AND s.enabled) THEN
   RETURN jsonb_build_object('mode','DISABLED','reserved',false);
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds h
    WHERE h.network=p_network AND h.invite_code=v_code AND h.status='HELD') THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','HELD_ADMISSION_CONFLICT');
 END IF;

 SELECT * INTO v_inv FROM public.invitations i
   WHERE i.invite_code=v_code AND i.activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','INVITE_NOT_FOUND'); END IF;

 -- Use the verified completion funding only after an immutable binding exists.
 SELECT f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
 INTO v_inv.reward_cohort_round_id,v_inv.reward_funding_allocation_receipt_id
 FROM public.read_effective_mission_reward_funding_v1(v_code,p_network) f;

 SELECT * INTO v_alloc FROM public.vebetter_round_allocations a
   WHERE a.id=v_inv.reward_funding_allocation_receipt_id
     AND a.network=p_network AND a.app_id=v_app
     AND a.vebetter_round_id+1=v_inv.reward_cohort_round_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','FUNDING_BINDING_MISSING'); END IF;

 -- The exact canonical candidate query already requires completed missions,
 -- live Sybil CLEAR + security-client checks, blockchain proof and no prior
 -- queue, payout or recovery. Count ONLY finalized eligible entries. Never
 -- dilute/escrow against unfinished participants or unaccepted invitations.
 SELECT count(*),coalesce(bool_or(c.invite_code=v_code),false),
   count(*) FILTER (WHERE public.reward_x_promotion_policy_for_invitation_v3(c.invite_code)='x-promotion-additive-v2')
 INTO v_candidates,v_candidate_present,v_legacy_candidates
 FROM public.read_reward_reservation_candidates_v2(p_network,100) c
 WHERE c.completion_block<=p_finalized_block;
 IF NOT v_candidate_present THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','NOT_FINAL_ELIGIBLE');
 END IF;
 IF v_candidates=0 OR v_candidates>=100 THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','UNBOUNDED_CANDIDATE_COUNT');
 END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR v_cfg.x_option_reserve_wei IS NULL OR v_cfg.x_option_reserve_wei<0
 THEN RAISE EXCEPTION 'SHARED_POOL_X_POLICY_UNAVAILABLE'; END IF;

 v_reserved:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 IF v_reserved<0 OR v_reserved>p_observed_pool_balance_wei THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','OUTSTANDING_EXCEEDS_POOL');
 END IF;
 v_headroom:=p_observed_pool_balance_wei-v_reserved;
 v_x_budget:=v_legacy_candidates*v_cfg.x_option_reserve_wei;
 IF v_headroom<=v_x_budget THEN
   RETURN jsonb_build_object('mode','DEFER','reserved',false,'reason','POOL_INSUFFICIENT_FOR_CURRENT_COMPLETIONS');
 END IF;
 v_quote:=public.calculate_reward_policy_aware_quote_v1(
   v_headroom,v_candidates,v_legacy_candidates,v_cfg.x_option_reserve_wei);
 IF v_quote<v_cfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','DEFER','reserved',false,'reason','REWARD_FUNDING_UNAVAILABLE');
 END IF;

 v_cohort_reserved:=public.read_reward_cohort_committed_wei(
    p_network,v_app,v_inv.reward_cohort_round_id,v_inv.reward_funding_allocation_receipt_id);
 v_basis:=jsonb_build_object(
    'quoteKind','shared_pool_completion_v1',
    'poolPolicy','shared-pool-v1',
    'fundingAllocationReceiptId',v_alloc.id::text,
    'rewardCohortRoundId',v_inv.reward_cohort_round_id::text,
    'cohortReservedWei',v_cohort_reserved::text,
    'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
    'reservedBeforeWei',v_reserved::text,
    'eligibleReadyCount',v_candidates,
    'xOptionReservedPerEligibleWei',v_cfg.x_option_reserve_wei::text,
    'legacyXEligibleCount',v_legacy_candidates,
    'legacyXReserveTotalWei',v_x_budget::text,
    'quoteWei',v_quote::text,
    'observationAt',p_observed_at);
 v_result:=public.commit_reward_reservation(
    v_code,p_network,p_observed_pool_balance_wei,v_reserved,v_quote,
    'shared-pool-v1',null,p_finalized_block,v_basis);

 RETURN v_result||jsonb_build_object(
    'mode',case when coalesce((v_result->>'reserved')::boolean,false)
      then 'SHARED_RESERVED' else 'SHARED_REJECTED' end,
    'policy','shared-pool-v1');
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_reward_x_promotion_live_split_from_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_invitation public.invitations%rowtype;
  v_calc record;
  v_runtime jsonb;
  v_policy text;
begin
  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if new.reserved_amount_wei is null
     or new.reserved_amount_wei<=0
     or new.reserved_at is null then
    return new;
  end if;

  v_policy:=public.reward_x_promotion_policy_for_invitation_v3(new.invite_code);
  if not v_cfg.reward_x_promotion_enabled then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_PAUSED_NO_UNSPLIT_FALLBACK'; end if;
    if v_cfg.reward_x_promotion_live_started_at is not null
       and new.reserved_at>=v_cfg.reward_x_promotion_live_started_at then
      perform public.record_reward_x_promotion_split_exemption_v1(
        new.id,
        new.invite_code,
        'FEATURE_DISABLED_AFTER_LIVE_START',
        '{}'::jsonb
      );
    end if;
    return new;
  end if;

  if v_cfg.reward_x_promotion_live_started_at is null then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_LIVE_START_MISSING'; end if;
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'LIVE_START_MISSING',
      '{}'::jsonb
    );
    return new;
  end if;

  if new.reserved_at<v_cfg.reward_x_promotion_live_started_at then
    return new;
  end if;

  if v_cfg.reward_x_promotion_policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'POLICY_UNSUPPORTED',
      jsonb_build_object(
        'policyVersion',
        coalesce(v_cfg.reward_x_promotion_policy_version,'')
      )
    );
    return new;
  end if;

  if not v_cfg.reward_x_promotion_payout_enabled
     or not v_cfg.reward_x_promotion_external_verification_ready then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_EXTERNAL_DISABLED'; end if;
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'DEPENDENCY_GATE_NOT_READY',
      jsonb_build_object(
        'payoutEnabled',
        v_cfg.reward_x_promotion_payout_enabled,
        'externalVerificationReady',
        v_cfg.reward_x_promotion_external_verification_ready
      )
    );
    return new;
  end if;

  if v_cfg.reward_x_promotion_external_verification_started_at is null then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_EXTERNAL_START_MISSING'; end if;
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'EXTERNAL_READY_START_MISSING',
      '{}'::jsonb
    );
    return new;
  end if;

  if new.reserved_at<v_cfg.reward_x_promotion_external_verification_started_at then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_EXTERNAL_TOO_EARLY'; end if;
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'BEFORE_EXTERNAL_READY_START',
      '{}'::jsonb
    );
    return new;
  end if;

  begin
    v_runtime :=
      public.read_reward_x_promotion_external_runtime_readiness_v1(
        new.network,
        1200
      );

    if not coalesce((v_runtime->>'ready')::boolean,false) then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_RUNTIME_NOT_READY'; end if;
      perform public.record_reward_x_promotion_split_exemption_v1(
        new.id,
        new.invite_code,
        'EXTERNAL_RUNTIME_NOT_READY',
        jsonb_build_object(
          'runtimeReason',
          coalesce(v_runtime->>'reason','UNKNOWN')
        )
      );
      return new;
    end if;

    if not exists (
      select 1
      from public.referral_links r
      where lower(r.inviter_wallet)=lower(new.recipient_wallet)
        and r.status='ACTIVE'
        and r.referral_key ~ '^(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})$'
    ) then
      if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_ACTIVE_REFERRAL_LINK_REQUIRED'; end if;
      perform public.record_reward_x_promotion_split_exemption_v1(
        new.id,
        new.invite_code,
        'ACTIVE_REFERRAL_LINK_MISSING',
        '{}'::jsonb
      );
      return new;
    end if;

    select * into v_invitation
    from public.invitations i
    where i.invite_code=new.invite_code;

    if found then
      select f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
      into v_invitation.reward_cohort_round_id,v_invitation.reward_funding_allocation_receipt_id
      from public.read_effective_mission_reward_funding_v1(new.invite_code,new.network) f;
    end if;

    if not found
       or v_invitation.reward_cohort_round_id is null
       or v_invitation.reward_funding_allocation_receipt_id is null
       or lower(v_invitation.inviter_wallet)<>lower(new.recipient_wallet)
       or v_invitation.activation_network<>new.network then
      raise exception 'REWARD_X_PROMOTION_LIVE_SOURCE_MISSING';
    end if;

    select * into v_calc
    from public.calculate_reward_x_promotion_for_policy_v3(
      new.reserved_amount_wei,v_policy
    );

    insert into public.reward_x_promotion_splits(
      queue_entry_id,
      invite_code,
      network,
      recipient_wallet,
      reservation_amount_wei,
      base_amount_wei,
      promotion_amount_wei,
      source_reward_cohort_round_id,
      source_allocation_receipt_id,
      mode,
      policy_version,
      promotion_rate_bps,
      promotion_cap_wei
    ) values (
      new.id,
      new.invite_code,
      new.network,
      lower(new.recipient_wallet),
      new.reserved_amount_wei,
      v_calc.base_amount_wei,
      v_calc.promotion_amount_wei,
      v_invitation.reward_cohort_round_id,
      v_invitation.reward_funding_allocation_receipt_id,
      'LIVE',
      v_policy,
      v_calc.promotion_rate_bps,
      v_calc.promotion_cap_wei
    );
  exception when others then
    if v_policy='x-promotion-withheld-10pct-v3' then raise; end if;
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      case
        when sqlerrm like '%REWARD_X_PROMOTION_BONUS_BUDGET_EXCEEDED%'
          then 'PROMOTION_BUDGET_UNAVAILABLE'
        else 'SPLIT_CREATION_FAILED'
      end,
      jsonb_build_object('sqlstate',sqlstate)
    );
    return new;
  end;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_reward_queue_cohort_budget()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_invitation public.invitations%rowtype;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_budget numeric(78,0) := 0;
  v_committed numeric(78,0) := 0;
  v_delta numeric(78,0) := 0;
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

  if found then
    select f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
    into v_invitation.reward_cohort_round_id,v_invitation.reward_funding_allocation_receipt_id
    from public.read_effective_mission_reward_funding_v1(new.invite_code,new.network) f;
  end if;

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

  -- Already-verified global shared-pool reservations must not be invalidated
  -- by the former per-cohort cap. All identity/receipt checks above remain.
  -- The canonical writer is the only authorized creator of shared reservations.
  if new.reservation_algorithm_version='shared-pool-v1' then
    return new;
  end if;

  v_budget:=public.read_reward_cohort_effective_budget_wei(
    v_receipt.network,
    v_receipt.app_id,
    v_invitation.reward_cohort_round_id,
    v_receipt.id
  );

  -- Use the same cohort commitment authority as forecasting/reservation.
  -- It already accounts for recovery offsets and RELEASED X promotion value,
  -- preventing this final DB guard from diverging from planning.
  v_committed:=public.read_reward_cohort_committed_wei(
    v_receipt.network,
    v_receipt.app_id,
    v_invitation.reward_cohort_round_id,
    v_receipt.id
  );

  -- BEFORE INSERT: the new queue row is not yet part of v_committed.
  -- BEFORE UPDATE from CANCELLED: the row is likewise not committed yet.
  -- Updates among committed states are already represented in v_committed,
  -- so adding the reservation again would double-count the current row.
  if tg_op='INSERT' then
    v_delta:=new.reserved_amount_wei;
  elsif old.status='CANCELLED'
        and new.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED') then
    v_delta:=new.reserved_amount_wei;
  else
    v_delta:=0;
  end if;

  if v_committed+v_delta>v_budget then
    raise exception 'REWARD_COHORT_BUDGET_EXCEEDED';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_cohort_committed_wei(p_network text, p_app_id text, p_reward_cohort_round_id bigint, p_allocation_receipt_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_queue_committed numeric(78,0) := 0;
  v_withheld_released numeric(78,0) := 0;
  v_offset_committed numeric(78,0) := 0;
  v_x_promotion_committed numeric(78,0) := 0;
  v_early_held numeric(78,0) := 0;
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
  cross join lateral public.read_effective_mission_reward_funding_v1(i.invite_code,q.network) f
  where q.network=p_network
    and f.reward_funding_allocation_receipt_id=v_receipt.id
    and f.reward_cohort_round_id=p_reward_cohort_round_id
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');

  -- Only v3 withholding is already included in the gross queue commitment.
  -- Returning it reduces lifetime commitment exactly once; a cancelled queue
  -- was excluded above, so it must never be subtracted again.
  select coalesce(sum(o.promotion_amount_wei),0)
  into v_withheld_released
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s on s.id=o.split_id
    and s.mode='LIVE' and s.policy_version='x-promotion-withheld-10pct-v3'
  join public.reward_queue_entries q on q.id=s.queue_entry_id
    and q.invite_code=o.invite_code and q.network=o.network
  where o.network=p_network
    and o.source_reward_cohort_round_id=p_reward_cohort_round_id
    and o.source_allocation_receipt_id=p_allocation_receipt_id
    and o.financial_state='RELEASED'
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');
  if v_withheld_released>v_queue_committed then
    raise exception 'REWARD_X_V3_RELEASE_EXCEEDS_COHORT_COMMITMENT';
  end if;

  select coalesce(sum(s.offset_amount_wei),0)
  into v_offset_committed
  from public.reward_recovery_settlements s
  join public.invitations i on i.invite_code=s.invite_code
  cross join lateral public.read_effective_mission_reward_funding_v1(i.invite_code,s.network) f
  where s.network=p_network
    and f.reward_funding_allocation_receipt_id=v_receipt.id
    and f.reward_cohort_round_id=p_reward_cohort_round_id
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

  select coalesce(sum(o.promotion_amount_wei),0)
  into v_x_promotion_committed
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
   and s.mode='LIVE'
   and s.policy_version='x-promotion-additive-v2'
  where o.network=p_network
    and o.source_reward_cohort_round_id=p_reward_cohort_round_id
    and o.source_allocation_receipt_id=p_allocation_receipt_id
    and o.financial_state in ('RESERVED','HELD','PAID');

  if v_x_promotion_committed<0 then
    raise exception 'REWARD_X_PROMOTION_NEGATIVE_COHORT_COMMITMENT';
  end if;

  -- Existing PAID and recovery offsets stay in lifetime spent, temporary
  -- HELD is added only until atomically converted to an immutable fixed entry.
  select coalesce(sum(h.amount_wei),0) into v_early_held
  from reward_admission_bridge.holds h
  where h.network=p_network and h.app_id=p_app_id and h.status='HELD'
    and h.reward_cohort_round_id=p_reward_cohort_round_id
    and h.funding_allocation_receipt_id=p_allocation_receipt_id;
  if v_early_held<0 then raise exception 'COHORT_ADMISSION_HOLD_CORRUPT'; end if;

  return
    v_early_held +
    (v_queue_committed-v_withheld_released) +
    v_x_promotion_committed +
    v_offset_committed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_reservation_candidates_v2(p_network text, p_limit integer DEFAULT 25)
 RETURNS TABLE(invite_code text, completion_block bigint, completion_tx_index integer, completion_clause_index integer, reward_cohort_round_id bigint, reward_funding_allocation_receipt_id bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with parameters as (
    select lower(btrim(p_network)) as network,
           greatest(1,least(coalesce(p_limit,25),100)) as row_limit
  )
  select
    i.invite_code,
    completion.block_number::bigint,
    completion.tx_index::integer,
    completion.clause_index::integer,
    funding.reward_cohort_round_id,
    funding.reward_funding_allocation_receipt_id
  from public.invitations i
  cross join parameters p
  cross join lateral public.read_effective_mission_reward_funding_v1(i.invite_code,p.network) funding
  left join public.sybil_v2_referral_assessments a
    on a.invite_code=i.invite_code
  left join public.sybil_v2_reward_clearances c
    on c.invite_code=i.invite_code
   and c.network=p.network
   and c.verdict='CLEAR'
   and c.verdict=a.state
   and c.assessment_revision=a.revision
  cross join lateral (
    select event.block_number,event.tx_index,event.clause_index
    from (
      select e.block_number,e.tx_index,e.clause_index
      from public.invite_impact_events e
      where funding.attempt_id is null
        and e.invite_code=i.invite_code
        and e.network=p.network
        and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
        and e.block_number is not null
        and e.tx_index is not null
        and e.clause_index is not null
      union all
      select funding.completion_block,funding.completion_tx_index,funding.completion_clause_index
      where funding.attempt_id is not null and funding.completion_block is not null
    ) event
    order by event.block_number desc,event.tx_index desc,event.clause_index desc
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
    and funding.reward_cohort_round_id is not null
    and funding.reward_funding_allocation_receipt_id is not null
    and (funding.attempt_id is null or
      (c.id is not null and c.evidence_cutoff_block>=funding.completion_block))
    and (
      not public.sybil_v2_enforcement_enabled()
      or (a.state='CLEAR' and c.id is not null)
    )
    and (
      not public.sybil_v2_enforcement_enabled()
      or not exists (
        select 1
        from public.sybil_v2_wallet_restrictions r
        where r.network=p.network
          and r.status='ACTIVE'
          and r.wallet_address in (
            lower(i.inviter_wallet),
            lower(i.invitee_wallet)
          )
      )
    )
    and not exists (
      select 1 from public.reward_queue_entries q
      where q.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_recovery_settlements s
      where s.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_reservation_legacy_exclusions x
      where x.invite_code=i.invite_code
    )
  order by completion.block_number,completion.tx_index,completion.clause_index,i.invite_code
  limit (select row_limit from parameters);
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_split()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_queue public.reward_queue_entries%rowtype;
  v_invitation public.invitations%rowtype;
  v_cfg public.reward_runtime_config%rowtype;
  v_expected record;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_budget numeric(78,0) := 0;
  v_committed numeric(78,0) := 0;
begin
  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if new.policy_version<>public.reward_x_promotion_policy_for_invitation_v3(new.invite_code) then
    raise exception 'REWARD_X_PROMOTION_POLICY_MISMATCH';
  end if;

  if new.policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
    raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
  end if;

  if new.mode='LIVE' and not v_cfg.reward_x_promotion_enabled then
    raise exception 'REWARD_X_PROMOTION_LIVE_DISABLED';
  end if;

  if new.mode='SHADOW' and not v_cfg.reward_x_promotion_shadow_enabled then
    raise exception 'REWARD_X_PROMOTION_SHADOW_DISABLED';
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.id=new.queue_entry_id;

  if not found
     or v_queue.invite_code<>new.invite_code
     or v_queue.network<>new.network
     or lower(v_queue.recipient_wallet)<>new.recipient_wallet
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<>new.reservation_amount_wei
     or v_queue.reserved_at is null then
    raise exception 'REWARD_X_PROMOTION_QUEUE_MISMATCH';
  end if;

  if new.mode='SHADOW' and (
    v_cfg.reward_x_promotion_shadow_started_at is null
    or v_queue.reserved_at < v_cfg.reward_x_promotion_shadow_started_at
    or (
      v_cfg.reward_x_promotion_live_started_at is not null
      and v_queue.reserved_at >= v_cfg.reward_x_promotion_live_started_at
    )
  ) then
    raise exception 'REWARD_X_PROMOTION_OUTSIDE_SHADOW_WINDOW';
  end if;

  if new.mode='LIVE' and (
    v_cfg.reward_x_promotion_live_started_at is null
    or v_queue.reserved_at < v_cfg.reward_x_promotion_live_started_at
  ) then
    raise exception 'REWARD_X_PROMOTION_OUTSIDE_LIVE_WINDOW';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if found then
    select f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
    into v_invitation.reward_cohort_round_id,v_invitation.reward_funding_allocation_receipt_id
    from public.read_effective_mission_reward_funding_v1(new.invite_code,new.network) f;
  end if;

  if not found
     or v_invitation.reward_cohort_round_id is null
     or v_invitation.reward_funding_allocation_receipt_id is null
     or lower(v_invitation.inviter_wallet)<>new.recipient_wallet
     or v_invitation.activation_network<>new.network
     or v_invitation.reward_cohort_round_id<>new.source_reward_cohort_round_id
     or v_invitation.reward_funding_allocation_receipt_id<>new.source_allocation_receipt_id then
    raise exception 'REWARD_X_PROMOTION_SOURCE_MISMATCH';
  end if;

  select * into v_expected
  from public.calculate_reward_x_promotion_for_policy_v3(
    new.reservation_amount_wei,new.policy_version
  );

  if new.base_amount_wei<>v_expected.base_amount_wei
     or new.promotion_amount_wei<>v_expected.promotion_amount_wei
     or new.promotion_rate_bps<>v_expected.promotion_rate_bps
     or new.promotion_cap_wei<>v_expected.promotion_cap_wei then
    raise exception 'REWARD_X_PROMOTION_CALCULATION_MISMATCH';
  end if;

  -- Protect the additional X 10 B3TR physically, but do not apply a
  -- superseded round cap to a shared-pool reservation.
  if new.mode='LIVE' and new.policy_version='x-promotion-additive-v2'
     and v_queue.reservation_algorithm_version='shared-pool-v1' then
    if coalesce(v_queue.reservation_basis->>'poolPolicy','')<>'shared-pool-v1'
       or coalesce(v_queue.reservation_basis->>'observedPoolBalanceWei','') !~ '^[0-9]+$'
       or (v_queue.reservation_basis->>'observedPoolBalanceWei')::numeric <
          public.read_outstanding_reward_liability(
            new.network,
            '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
          )::numeric + new.promotion_amount_wei
    then
      raise exception 'SHARED_POOL_X_BONUS_PHYSICAL_CAPACITY_EXCEEDED';
    end if;
  elsif new.mode='LIVE' and new.policy_version='x-promotion-additive-v2' then
    select * into v_receipt
    from public.vebetter_round_allocations a
    where a.id=new.source_allocation_receipt_id;

    if not found
       or v_receipt.network<>new.network
       or v_receipt.vebetter_round_id+1<>new.source_reward_cohort_round_id then
      raise exception 'REWARD_X_PROMOTION_SOURCE_MISMATCH';
    end if;

    -- The queue row already exists and is included in committed value. The
    -- additive X bonus is not, so reserve it explicitly before promising it.
    v_budget:=public.read_reward_cohort_effective_budget_wei(
      new.network,
      v_receipt.app_id,
      new.source_reward_cohort_round_id,
      new.source_allocation_receipt_id
    );
    v_committed:=public.read_reward_cohort_committed_wei(
      new.network,
      v_receipt.app_id,
      new.source_reward_cohort_round_id,
      new.source_allocation_receipt_id
    );

    if v_committed+new.promotion_amount_wei>v_budget then
      raise exception 'REWARD_X_PROMOTION_BONUS_BUDGET_EXCEEDED';
    end if;
  end if;

  if new.mode='LIVE' and exists (
    select 1
    from public.reward_payouts rp
    where rp.invite_code=new.invite_code
  ) then
    raise exception 'REWARD_X_PROMOTION_SPLIT_TOO_LATE';
  end if;

  return new;
end;
$function$;

COMMIT;
