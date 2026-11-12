-- VeInvite shared physical-pool atomic settlement, staged OFF.
-- Independent mainnet production routine hash guards detect concurrent work.
-- New paths cannot run until an explicit migration enables shared_pool_settings.
DO $guard$
BEGIN
  IF coalesce((SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='commit_reward_reservation'),'') <> 'bcf47062c2942f172c014f4e58805dd5' THEN RAISE EXCEPTION 'SHARED_POOL_REVIEW_REQUIRED_COMMIT_REWARD_RESERVATION'; END IF;
  IF coalesce((SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='enforce_reward_queue_cohort_budget'),'') <> 'a2e9df9e62eccc05f5b6157bbc82a225' THEN RAISE EXCEPTION 'SHARED_POOL_REVIEW_REQUIRED_ENFORCE_REWARD_QUEUE_COHORT_BUDGET'; END IF;
  IF coalesce((SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='validate_reward_x_promotion_split'),'') <> 'a3f975602f0f33262f4e6732cd14571d' THEN RAISE EXCEPTION 'SHARED_POOL_REVIEW_REQUIRED_VALIDATE_REWARD_X_PROMOTION_SPLIT'; END IF;
  IF coalesce((SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='read_reward_elastic_contingent_scope_liability_wei_v1'),'') <> '080b1fb30823e8f2f4450748583ae677' THEN RAISE EXCEPTION 'SHARED_POOL_REVIEW_REQUIRED_READ_REWARD_ELASTIC_CONTINGENT_SCOPE_LIABILITY_WEI_V1'; END IF;
  IF coalesce((SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='read_reward_elastic_public_scenarios_v1'),'') <> '98657b0218fc0fc7031682ff341a7980' THEN RAISE EXCEPTION 'SHARED_POOL_REVIEW_REQUIRED_READ_REWARD_ELASTIC_PUBLIC_SCENARIOS_V1'; END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.shared_pool_settings (
  id integer PRIMARY KEY CHECK (id=1),
  enabled boolean NOT NULL DEFAULT false,
  policy_version text NOT NULL DEFAULT 'shared-pool-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  enabled_at timestamptz
);
INSERT INTO reward_admission_bridge.shared_pool_settings(id,enabled)
VALUES (1,false) ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON reward_admission_bridge.shared_pool_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON reward_admission_bridge.shared_pool_settings TO service_role;

CREATE OR REPLACE FUNCTION public.read_reward_shared_pool_mode_v1(p_network text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','reward_admission_bridge'
AS $mode$
DECLARE v_active boolean;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging') THEN
   RAISE EXCEPTION 'SHARED_POOL_MODE_INVALID_NETWORK';
 END IF;
 SELECT s.enabled INTO v_active FROM reward_admission_bridge.shared_pool_settings s WHERE s.id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'SHARED_POOL_MODE_MISSING'; END IF;
 RETURN jsonb_build_object('enabled',v_active,'policy','shared-pool-v1');
END $mode$;
REVOKE ALL ON FUNCTION public.read_reward_shared_pool_mode_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_shared_pool_mode_v1(text) TO service_role;

-- Original reviewed commit_reward_reservation: bcf47062c2942f172c014f4e58805dd5
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
$function$


-- Original reviewed enforce_reward_queue_cohort_budget: a2e9df9e62eccc05f5b6157bbc82a225
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
$function$


-- Original reviewed validate_reward_x_promotion_split: a3f975602f0f33262f4e6732cd14571d
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

  if btrim(new.policy_version)<>btrim(v_cfg.reward_x_promotion_policy_version) then
    raise exception 'REWARD_X_PROMOTION_POLICY_MISMATCH';
  end if;

  if new.policy_version<>'x-promotion-additive-v2' then
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

  if not found
     or lower(v_invitation.inviter_wallet)<>new.recipient_wallet
     or v_invitation.activation_network<>new.network
     or v_invitation.reward_cohort_round_id<>new.source_reward_cohort_round_id
     or v_invitation.reward_funding_allocation_receipt_id<>new.source_allocation_receipt_id then
    raise exception 'REWARD_X_PROMOTION_SOURCE_MISMATCH';
  end if;

  select * into v_expected
  from public.calculate_reward_x_promotion_additive_v2(
    new.reservation_amount_wei
  );

  if new.base_amount_wei<>v_expected.base_amount_wei
     or new.promotion_amount_wei<>v_expected.promotion_amount_wei
     or new.promotion_rate_bps<>v_expected.promotion_rate_bps
     or new.promotion_cap_wei<>v_expected.promotion_cap_wei then
    raise exception 'REWARD_X_PROMOTION_CALCULATION_MISMATCH';
  end if;

  -- Additive X is a separately committed 10 B3TR liability. For the new
  -- global-pool settlement, validate it against the same observed physical
  -- pool after the base queue reservation is inserted. No second round cap.
  if new.mode='LIVE'
     and v_queue.reservation_algorithm_version='shared-pool-v1' then
    if coalesce(v_queue.reservation_basis->>'poolPolicy','')<>'shared-pool-v1'
       or coalesce(v_queue.reservation_basis->>'observedPoolBalanceWei','') !~ '^[0-9]+
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
$function$

       or (v_queue.reservation_basis->>'observedPoolBalanceWei')::numeric <
          public.read_outstanding_reward_liability(
            new.network,
            '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
          )::numeric + new.promotion_amount_wei
    then
      raise exception 'SHARED_POOL_X_BONUS_PHYSICAL_CAPACITY_EXCEEDED';
    end if;
  elsif new.mode='LIVE' then
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
$function$


-- Original reviewed read_reward_elastic_contingent_scope_liability_wei_v1: 080b1fb30823e8f2f4450748583ae677
CREATE OR REPLACE FUNCTION public.read_reward_elastic_contingent_scope_liability_wei_v1(p_network text, p_app_id text, p_target_cohort bigint, p_target_receipt bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_cohort record;
 v_unbound bigint;
 v_budget numeric(78,0);
 v_active_committed numeric(78,0);
 v_finalized_paid_not_in_queue numeric(78,0);
 v_unspent numeric(78,0);
 v_total numeric(78,0):=0;
BEGIN
 p_network:=lower(btrim(coalesce(p_network,'')));
 p_app_id:=lower(btrim(coalesce(p_app_id,'')));
 IF p_network NOT IN ('mainnet','testnet','testnet-staging') OR p_app_id<>v_app
 THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_INVALID_SCOPE'; END IF;
 IF (p_target_cohort IS NULL) <> (p_target_receipt IS NULL) THEN
   RAISE EXCEPTION 'ELASTIC_CONTINGENT_TARGET_INCOMPLETE';
 END IF;
 -- A completion-time, shared physical-pool promise no longer ring-fences
 -- future unfinished participants or cohort-based hypothetical budgets.
 -- Existing fixed base, X and early HELD remain in the canonical reader.
 IF EXISTS (SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
            WHERE s.id=1 AND s.enabled)
 THEN RETURN 0; END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled OR NOT v_cfg.allow_protected_partial_settlement
 THEN RETURN 0; END IF;
 IF v_cfg.rollout_not_before IS NULL THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_NO_EPOCH'; END IF;
 -- Unbound accepted invitations cannot safely reserve a cohort yet. Fail
 -- CLOSED: even unrelated rewards must not spend unknown new liabilities.
 SELECT count(*) INTO v_unbound FROM public.invitations i
 WHERE i.activation_network=p_network AND i.activated_at>=v_cfg.rollout_not_before
   AND i.status<>'CANCELLED' AND i.sybil_status<>'BLOCKED'
   AND (i.reward_cohort_round_id IS NULL
        OR i.reward_funding_allocation_receipt_id IS NULL);
 IF v_unbound>0 THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_UNBOUND_INVITATIONS'; END IF;
 FOR v_cohort IN
   SELECT DISTINCT i.reward_cohort_round_id AS round_id,
     i.reward_funding_allocation_receipt_id AS receipt_id
   FROM public.invitations i
   WHERE i.activation_network=p_network
     AND i.activated_at>=v_cfg.rollout_not_before
     AND i.status<>'CANCELLED' AND i.sybil_status<>'BLOCKED'
     AND (p_target_cohort IS NULL OR
       (i.reward_cohort_round_id=p_target_cohort
        AND i.reward_funding_allocation_receipt_id=p_target_receipt))
 LOOP
   v_budget:=public.read_reward_cohort_effective_budget_wei(
     p_network,v_app,v_cohort.round_id,v_cohort.receipt_id);
   v_active_committed:=public.read_reward_cohort_committed_wei(
     p_network,v_app,v_cohort.round_id,v_cohort.receipt_id);
   -- A PAID payout without an active queue no longer occupies a pending
   -- on-chain liability but DID consume this cohort's historical budget.
   SELECT coalesce(sum(p.amount_wei),0) INTO v_finalized_paid_not_in_queue
   FROM public.reward_payouts p
   JOIN public.invitations i ON i.invite_code=p.invite_code
   JOIN public.reward_rounds r ON r.id=p.round_id
   WHERE r.network=p_network AND r.app_id=v_app AND p.status='PAID'
     AND i.reward_cohort_round_id=v_cohort.round_id
     AND i.reward_funding_allocation_receipt_id=v_cohort.receipt_id
     AND NOT EXISTS (
       SELECT 1 FROM public.reward_queue_entries q
       WHERE q.invite_code=p.invite_code
         AND q.network=p_network
         AND q.reserved_amount_wei IS NOT NULL
         AND q.status IN ('AWAITING_CLAIM','QUEUED','ASSIGNED'));
   IF v_budget<0 OR v_active_committed<0 OR v_finalized_paid_not_in_queue<0
      OR v_budget<v_active_committed+v_finalized_paid_not_in_queue
   THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_BUDGET_INCONSISTENT'; END IF;
   -- Release ONLY once the source-sweep interlock independently confirms
   -- no pending invite, unpaid base Claim, 72h X opportunity or LIVE X
   -- verification remains. A confirmed BLOCKED Sybil is terminal.
   IF public.reward_elastic_source_has_unsettled_slots_v1(
     p_network,v_app,v_cohort.round_id,v_cohort.receipt_id
   ) THEN
     v_unspent:=v_budget-v_active_committed-v_finalized_paid_not_in_queue;
   ELSE
     v_unspent:=0;
   END IF;
   v_total:=v_total+v_unspent;
 END LOOP;
 IF v_total<0 OR v_total<>trunc(v_total) THEN
   RAISE EXCEPTION 'ELASTIC_CONTINGENT_ACCOUNTING_INVALID';
 END IF;
 RETURN v_total;
END $function$


-- Original reviewed read_reward_elastic_public_scenarios_v1: 98657b0218fc0fc7031682ff341a7980
CREATE OR REPLACE FUNCTION public.read_reward_elastic_public_scenarios_v1(p_network text, p_app_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_alloc public.vebetter_round_allocations%rowtype;
 v_forecast public.reward_forecast_snapshots%rowtype;
 v_cohort bigint;
 v_committed numeric(78,0);
 v_budget numeric(78,0);
 v_outstanding numeric(78,0);
 v_confirmed_unsettled numeric(78,0) := 0;
 v_first_confirmed_at timestamptz;
 v_pre_broadcast_pool numeric(78,0);
 v_old numeric(78,0);
 v_recent numeric(78,0);
 v_bank numeric(78,0);
 v_pool numeric(78,0);
 v_accepted bigint;
 v_one numeric(78,0);
 v_two numeric(78,0);
 v_three numeric(78,0);
 v_physical numeric(78,0);
 v_uncommitted numeric(78,0);
 v_shared jsonb;
BEGIN
 p_network:=lower(btrim(coalesce(p_network,'')));
 p_app_id:=lower(btrim(coalesce(p_app_id,'')));
 IF p_network NOT IN ('mainnet','testnet','testnet-staging') OR p_app_id<>v_app
 THEN RAISE EXCEPTION 'ELASTIC_PUBLIC_ESTIMATE_SCOPE_INVALID'; END IF;
 -- The new payment writer and public estimator use the same shared pool
 -- physical-capacity inputs. Keep the historical response shape/UI unchanged.
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
           WHERE s.id=1 AND s.enabled) THEN
   v_shared := public.read_reward_shared_pool_capacity_shadow_v1(p_network,p_app_id);
   IF v_shared->>'mode'<>'SHADOW_ONLY' THEN
     RETURN jsonb_build_object('mode','PENDING','reason',
       coalesce(v_shared->>'reason','SHARED_POOL_UNAVAILABLE'));
   END IF;
   SELECT * INTO v_alloc FROM public.vebetter_round_allocations a
    WHERE a.network=p_network AND a.app_id=v_app
    ORDER BY a.vebetter_round_id DESC,a.id DESC LIMIT 1;
   IF NOT FOUND THEN RETURN jsonb_build_object('mode','PENDING','reason','ALLOCATION_MISSING'); END IF;
   v_cohort:=v_alloc.vebetter_round_id+1;
   SELECT count(*) INTO v_accepted FROM public.invitations i
    WHERE i.activation_network=p_network AND i.reward_cohort_round_id=v_cohort
      AND i.reward_funding_allocation_receipt_id=v_alloc.id AND i.status<>'CANCELLED';
   RETURN jsonb_build_object(
      'mode','ELASTIC_SCENARIOS','rewardCohortRoundId',v_cohort,
      'acceptedParticipants',v_accepted,'observedAt',v_shared->>'observedAt',
      'oneWinnerWei',v_shared->>'oneWinnerWei',
      'twoWinnersWei',v_shared->>'twoWinnersWei',
      'threeWinnersWei',v_shared->>'threeWinnersWei',
      'xOptionReservePerWinnerWei',v_shared->>'xOptionReservePerWinnerWei',
      'finalPayoutNotGuaranteed',true,'writesPerformed',false);
 END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled THEN RETURN jsonb_build_object('mode','LEGACY'); END IF;
 SELECT * INTO v_alloc FROM public.vebetter_round_allocations a
 WHERE a.network=p_network AND a.app_id=v_app
 ORDER BY a.vebetter_round_id DESC,a.id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','PENDING','reason','ALLOCATION_MISSING'); END IF;
 v_cohort:=v_alloc.vebetter_round_id+1;
 -- Old accepted, noncancelled participants get legacy pricing, never an
 -- inflated hypothetical elastic quote.
 IF EXISTS (SELECT 1 FROM public.invitations i
  WHERE i.activation_network=p_network
    AND i.reward_cohort_round_id=v_cohort
    AND i.reward_funding_allocation_receipt_id=v_alloc.id
    AND i.status<>'CANCELLED'
    AND (i.activated_at IS NULL OR i.activated_at<v_cfg.rollout_not_before))
 THEN RETURN jsonb_build_object('mode','LEGACY','reason','MIXED_HISTORICAL_COHORT'); END IF;
 SELECT * INTO v_forecast FROM public.reward_forecast_snapshots f
 WHERE f.network=p_network AND f.app_id=v_app
 ORDER BY f.generated_at DESC,f.id DESC LIMIT 1;
 IF NOT FOUND OR v_forecast.generated_at<clock_timestamp()-interval '75 minutes'
   OR v_forecast.generated_at>clock_timestamp()+interval '2 minutes'
   OR v_forecast.projected_funding_round_id<>v_cohort THEN
   RETURN jsonb_build_object('mode','PENDING','reason','FRESH_CHAIN_OBSERVATION_REQUIRED');
 END IF;
 v_pool:=v_forecast.observed_pool_balance_wei;
 v_committed:=public.read_reward_cohort_committed_wei(p_network,v_app,v_cohort,v_alloc.id);
 v_budget:=public.read_reward_cohort_effective_budget_wei(p_network,v_app,v_cohort,v_alloc.id);
 v_outstanding:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 -- Display-only correction. Canonical-successful, still-unfinalized B3TR
 -- transfers already reduce the observed on-chain pool, but their immutable
 -- reserved base amount stays in outstanding liabilities until full finality.
 -- Never change the payout/liability authority; eliminate the duplicate
 -- subtraction ONLY after an independent earlier pool snapshot proves that
 -- at least the same amount actually left the physical pool.
 SELECT coalesce(sum(q.reserved_amount_wei),0),min(rr.broadcast_confirmed_at)
 INTO v_confirmed_unsettled,v_first_confirmed_at
 FROM public.reward_queue_entries q
 JOIN public.reward_payouts rp ON rp.invite_code=q.invite_code
   AND rp.round_id=q.assigned_round_id
 JOIN public.reward_rounds rr ON rr.id=rp.round_id
 WHERE q.network=p_network AND q.status='ASSIGNED'
   AND q.reserved_amount_wei IS NOT NULL
   AND rr.network=p_network AND rr.app_id=v_app
   AND rr.broadcast_confirmed_at IS NOT NULL
   AND rr.broadcast_confirmed_at<=v_forecast.generated_at
   AND rp.status IN ('PENDING','SENDING')
   AND rp.amount_wei=q.reserved_amount_wei;
 IF v_confirmed_unsettled>0 THEN
   SELECT f.observed_pool_balance_wei INTO v_pre_broadcast_pool
   FROM public.reward_forecast_snapshots f
   WHERE f.network=p_network AND f.app_id=v_app
     AND f.generated_at<v_first_confirmed_at
   ORDER BY f.generated_at DESC,f.id DESC LIMIT 1;
   IF v_pre_broadcast_pool IS NOT NULL
      AND v_pre_broadcast_pool>=v_pool+v_confirmed_unsettled
      AND v_outstanding>=v_confirmed_unsettled THEN
      v_outstanding:=v_outstanding-v_confirmed_unsettled;
   END IF;
 END IF;
 v_recent:=public.read_reward_boost_reserve_recent_protected_wei(p_network,v_app,v_cohort);
 v_bank:=public.read_reward_boost_reserve_bank_stress_reserve_wei(p_network,v_app);
 v_old:=reward_admission_bridge.read_legacy_live_unpaid_stress_wei_v1(
    p_network,v_app,v_cohort);
 SELECT count(*) INTO v_accepted
 FROM public.invitations i
 WHERE i.activation_network=p_network
   AND i.reward_cohort_round_id=v_cohort
   AND i.reward_funding_allocation_receipt_id=v_alloc.id
   AND i.status<>'CANCELLED';
 IF v_committed<>0 OR v_budget<=0 OR v_pool<=0 OR v_outstanding<0
   OR v_recent<0 OR v_bank<0 OR v_old<0 THEN
   RETURN jsonb_build_object('mode','PENDING','reason','CURRENT_COHORT_ACCOUNTING_NOT_PREVIEWABLE');
 END IF;
 -- Financial capacity already reduced by exact unpaid base/X, unweighted
 -- historical worst-case payouts, recent protected and bank-stress balance.
 v_uncommitted:=greatest(v_budget-v_committed,0);
 v_physical:=greatest(v_pool-v_outstanding-v_old-v_recent-v_bank,0);
 v_one:=floor(least(greatest(v_uncommitted-v_cfg.x_option_reserve_wei,0),
                        greatest(v_physical-v_cfg.x_option_reserve_wei,0)));
 v_two:=floor(least(greatest(v_uncommitted-2*v_cfg.x_option_reserve_wei,0),
                        greatest(v_physical-2*v_cfg.x_option_reserve_wei,0))/2);
 v_three:=floor(least(greatest(v_uncommitted-3*v_cfg.x_option_reserve_wei,0),
                          greatest(v_physical-3*v_cfg.x_option_reserve_wei,0))/3);
 IF v_one<=0 THEN RETURN jsonb_build_object('mode','PENDING','reason','NO_SAFE_ESTIMATED_PAYOUT'); END IF;
 RETURN jsonb_build_object(
  'mode','ELASTIC_SCENARIOS',
  'rewardCohortRoundId',v_cohort,
  'observedAt',v_forecast.generated_at,
  'acceptedParticipants',v_accepted,
  'oneWinnerWei',v_one::text,'twoWinnersWei',v_two::text,'threeWinnersWei',v_three::text,
  'xOptionReservePerWinnerWei',v_cfg.x_option_reserve_wei::text,
  'settlementEarliestHoursAfterOfficialClose',v_cfg.close_grace_hours,
  'finalPayoutNotGuaranteed',true,'writesPerformed',false
 );
END $function$

-- A serializable-by-network, completion-only shared-pool quote.
-- Historical late quote snapshots remain immutable archival evidence; they
-- are not promises until actual valid completion has been reserved.
CREATE OR REPLACE FUNCTION public.commit_reward_shared_pool_v1(
 p_invite_code text, p_network text, p_observed_pool_balance_wei numeric,
 p_observed_at timestamptz, p_finalized_block bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','reward_admission_bridge'
AS $writer$
DECLARE
 v_code text:=upper(btrim(coalesce(p_invite_code,'')));
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_inv public.invitations%rowtype;
 v_alloc public.vebetter_round_allocations%rowtype;
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_candidates bigint;
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

 SELECT * INTO v_alloc FROM public.vebetter_round_allocations a
   WHERE a.id=v_inv.reward_funding_allocation_receipt_id
     AND a.network=p_network AND a.app_id=v_app
     AND a.vebetter_round_id+1=v_inv.reward_cohort_round_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','FUNDING_BINDING_MISSING'); END IF;

 -- The exact canonical candidate query already requires completed missions,
 -- live Sybil CLEAR + security-client checks, blockchain proof and no prior
 -- queue, payout or recovery. Count ONLY finalized eligible entries. Never
 -- dilute/escrow against unfinished participants or unaccepted invitations.
 SELECT count(*),coalesce(bool_or(c.invite_code=v_code),false)
 INTO v_candidates,v_candidate_present
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
 v_x_budget:=v_candidates*v_cfg.x_option_reserve_wei;
 IF v_headroom<=v_x_budget THEN
   RETURN jsonb_build_object('mode','DEFER','reserved',false,'reason','POOL_INSUFFICIENT_FOR_CURRENT_COMPLETIONS');
 END IF;
 v_quote:=floor((v_headroom-v_x_budget)/v_candidates);
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
$writer$;
REVOKE ALL ON FUNCTION public.commit_reward_shared_pool_v1(text,text,numeric,timestamptz,bigint)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_reward_shared_pool_v1(text,text,numeric,timestamptz,bigint)
  TO service_role;
