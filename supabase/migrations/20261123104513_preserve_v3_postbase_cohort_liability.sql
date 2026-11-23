-- Keep the withheld v3 10% committed within its funding cohort after
-- the 90% base payout changes the queue from ASSIGNED to PAID. Before that,
-- the full gross queue reservation already counts the 10%, so never double
-- count. RELEASED automatically exits the counted obligation states.
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

  select coalesce(sum(o.promotion_amount_wei),0)
  into v_x_promotion_committed
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
   and s.mode='LIVE'
   and (
     s.policy_version='x-promotion-additive-v2'
     or (
       s.policy_version='x-promotion-withheld-10pct-v3'
       and exists (
         select 1 from public.reward_queue_entries q
         where q.id=s.queue_entry_id
           and q.status='PAID'
       )
     )
   )
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
    v_queue_committed +
    v_x_promotion_committed +
    v_offset_committed;
end;
$function$;
