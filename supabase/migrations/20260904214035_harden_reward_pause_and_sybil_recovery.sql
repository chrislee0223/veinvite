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
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_invitation public.invitations%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_entry_class text;
  v_reserved numeric(78,0) := 0;
  v_legacy_payout_reserved numeric(78,0) := 0;
  v_completion_block bigint;
  v_completion_tx_index integer;
  v_completion_clause_index integer;
  v_mainnet_enabled boolean;
  v_emergency_paused boolean;
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

  -- Serialize reservation creation with emergency pause changes. Once the pause
  -- transaction owns this lock, no later immutable reward liability can be
  -- created until the pause state has been committed and observed here.
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_emergency_reward_pause',0)
  );

  select mainnet_funded_rewards_enabled, emergency_rewards_paused
  into v_mainnet_enabled, v_emergency_paused
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

  select e.block_number::bigint,e.tx_index::integer,e.clause_index::integer
  into v_completion_block,v_completion_tx_index,v_completion_clause_index
  from public.invite_impact_events e
  where e.invite_code=v_code and e.network=v_network
    and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
    and e.block_number is not null and e.tx_index is not null and e.clause_index is not null
  order by e.block_number desc,e.tx_index desc,e.clause_index desc limit 1;

  if v_completion_block is null or v_completion_tx_index is null or v_completion_clause_index is null then
    return jsonb_build_object('reserved',false,'reason','COMPLETION_POSITION_MISSING');
  end if;
  if v_completion_block > p_finalized_block then
    return jsonb_build_object('reserved',false,'reason','AWAITING_FINALITY','completionBlock',v_completion_block,'finalizedBlock',p_finalized_block);
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

  select coalesce(sum(q.reserved_amount_wei),0) into v_reserved
  from public.reward_queue_entries q
  where q.network=v_network and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists(select 1 from public.reward_payouts paid where paid.invite_code=q.invite_code and paid.status='PAID');

  select coalesce(sum(rp.amount_wei),0) into v_legacy_payout_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  where rr.network=v_network and rp.status in ('PENDING','SENDING','FAILED')
    and not exists(select 1 from public.reward_queue_entries q where q.invite_code=rp.invite_code and q.reserved_amount_wei is not null);
  v_reserved := v_reserved + v_legacy_payout_reserved;

  if v_reserved <> p_expected_reserved_before_wei then
    return jsonb_build_object('reserved',false,'reason','RECALCULATE','reservedExistingWei',v_reserved::text);
  end if;
  if p_amount_wei > greatest(p_observed_pool_balance_wei-v_reserved,0) then
    return jsonb_build_object('reserved',false,'reason','RECALCULATE','reservedExistingWei',v_reserved::text,'availableWei',greatest(p_observed_pool_balance_wei-v_reserved,0)::text);
  end if;

  insert into public.reward_queue_entries(
    invite_code,recipient_wallet,eligibility_check_id,entry_class,network,eligible_at,status,
    claim_requested_at,claim_requested_by_wallet,reserved_amount_wei,reserved_at,reservation_algorithm_version,
    reservation_quote_snapshot_id,reservation_completion_block,reservation_completion_tx_index,
    reservation_completion_clause_index,reservation_basis
  ) values (
    v_code,lower(v_invitation.inviter_wallet),v_invitation.eligibility_check_id,v_entry_class,v_network,
    v_invitation.reward_eligible_at,'AWAITING_CLAIM',null,null,p_amount_wei,v_now,btrim(p_algorithm_version),
    p_quote_snapshot_id,v_completion_block,v_completion_tx_index,v_completion_clause_index,
    p_basis || jsonb_build_object('observedPoolBalanceWei',p_observed_pool_balance_wei::text,'reservedBeforeWei',v_reserved::text,'finalizedBlock',p_finalized_block)
  ) returning * into v_queue;

  return jsonb_build_object(
    'reserved',true,'reason','RESERVED','inviteCode',v_queue.invite_code,'amountWei',v_queue.reserved_amount_wei::text,
    'reservedAt',v_queue.reserved_at,'status',v_queue.status,'completionBlock',v_queue.reservation_completion_block,
    'completionTxIndex',v_queue.reservation_completion_tx_index,'completionClauseIndex',v_queue.reservation_completion_clause_index
  );
end;
$function$;

create or replace function public.enforce_reward_queue_cohort_budget()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_invitation public.invitations%rowtype;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_adjustment numeric(78,0) := 0;
  v_existing numeric(78,0) := 0;
  v_budget numeric(78,0) := 0;
begin
  if new.reserved_amount_wei is null or new.status = 'CANCELLED' then return new; end if;

  -- This trigger also runs when a previously cancelled fixed reservation is
  -- restored. Share the reservation lock so concurrent restores/new quotes
  -- cannot both observe the same remaining cohort capacity.
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_' || new.network,0)
  );

  select * into v_invitation
  from public.invitations i
  where i.invite_code = new.invite_code;

  if not found
     or v_invitation.reward_cohort_round_id is null
     or v_invitation.reward_funding_allocation_receipt_id is null then
    raise exception 'REWARD_COHORT_BINDING_REQUIRED';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id = v_invitation.reward_funding_allocation_receipt_id;

  if not found
     or v_receipt.network <> new.network
     or v_receipt.vebetter_round_id + 1 <> v_invitation.reward_cohort_round_id then
    raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
  end if;

  select coalesce(sum(a.amount_wei),0)
  into v_adjustment
  from public.reward_cohort_funding_adjustments a
  where a.network = v_receipt.network
    and a.app_id = v_receipt.app_id
    and a.reward_cohort_round_id = v_invitation.reward_cohort_round_id
    and a.allocation_receipt_id = v_receipt.id;

  v_budget := v_receipt.rewards_allocation_amount_wei + v_adjustment;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_existing
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code = q.invite_code
  where q.network = new.network
    and i.reward_funding_allocation_receipt_id = v_receipt.id
    and i.reward_cohort_round_id = v_invitation.reward_cohort_round_id
    and q.invite_code <> new.invite_code
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');

  if v_existing + new.reserved_amount_wei > v_budget then
    raise exception 'REWARD_COHORT_BUDGET_EXCEEDED';
  end if;

  return new;
end;
$function$;

drop trigger if exists reward_queue_cohort_budget_guard on public.reward_queue_entries;
create trigger reward_queue_cohort_budget_guard
before insert or update of reserved_amount_wei, status
on public.reward_queue_entries
for each row execute function public.enforce_reward_queue_cohort_budget();

create or replace function public.sync_reward_queue_from_invitation()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_should_cancel boolean := false;
begin
  if tg_op='UPDATE' and old.reward_status='ELIGIBLE' and new.reward_status <> 'ELIGIBLE' then
    v_should_cancel := true;
  end if;

  if v_should_cancel then
    update public.reward_queue_entries
    set status='CANCELLED', cancelled_at=now(), cancel_reason=case
      when new.status='CANCELLED' then 'invitation_cancelled'
      when new.sybil_status='BLOCKED' then 'sybil_blocked'
      when new.reward_status='FORFEITED' then 'reward_forfeited'
      else 'eligibility_revoked'
    end
    where invite_code=new.invite_code and status in ('AWAITING_CLAIM','QUEUED');
  end if;

  -- A Sybil false positive may temporarily revoke an already-fixed reward.
  -- When the invitation returns to a verified COMPLETED + ELIGIBLE + CLEAR
  -- state, restore the immutable reservation to AWAITING_CLAIM and require a
  -- fresh claim. The status-aware cohort budget guard rechecks capacity. If the
  -- released capacity was legitimately consumed meanwhile, leave this queue
  -- entry cancelled instead of rolling back the operator's CLEAR decision.
  if tg_op='UPDATE'
     and old.reward_status is distinct from 'ELIGIBLE'
     and new.reward_status='ELIGIBLE'
     and new.status='COMPLETED'
     and new.sybil_status='CLEAR'
     and new.reward_eligible_at is not null then
    begin
      update public.reward_queue_entries q
      set status='AWAITING_CLAIM',
          eligible_at=new.reward_eligible_at,
          queued_at=null,
          claim_requested_at=null,
          claim_requested_by_wallet=null,
          cancelled_at=null,
          cancel_reason=null
      where q.invite_code=new.invite_code
        and q.status='CANCELLED'
        and q.cancel_reason in ('sybil_blocked','eligibility_revoked')
        and q.reserved_amount_wei is not null
        and q.reserved_amount_wei > 0
        and q.reserved_at is not null
        and not exists(
          select 1 from public.reward_payouts rp
          where rp.invite_code=q.invite_code
        );
    exception when others then
      if sqlerrm = 'REWARD_COHORT_BUDGET_EXCEEDED' then
        null;
      else
        raise;
      end if;
    end;
  end if;

  return new;
end;
$function$;

create index if not exists invitations_reward_funding_receipt_cohort_idx
on public.invitations (reward_funding_allocation_receipt_id, reward_cohort_round_id)
where reward_funding_allocation_receipt_id is not null;

create index if not exists reward_cohort_funding_adjustments_receipt_cohort_idx
on public.reward_cohort_funding_adjustments (allocation_receipt_id, reward_cohort_round_id);
