create or replace function public.read_reward_x_promotion_post_base_liability_wei(
  p_network text,
  p_app_id text
)
returns numeric
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(p_network));
  v_app_id text := lower(btrim(p_app_id));
  v_amount numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;
  if v_app_id<>v_veinvite_app_id then
    raise exception 'REWARD_X_PROMOTION_APP_MISMATCH';
  end if;

  select coalesce(sum(o.promotion_amount_wei),0)
  into v_amount
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
   and s.mode='LIVE'
  where o.network=v_network
    and (
      o.financial_state='HELD'
      or (
        o.financial_state='RESERVED'
        and exists (
          select 1
          from public.reward_payouts p
          join public.reward_receipts r
            on r.payout_id=p.id
          where p.invite_code=o.invite_code
            and p.recipient_wallet=o.recipient_wallet
            and p.status='PAID'
            and p.amount_wei=s.base_amount_wei
            and p.paid_at is not null
            and r.invite_code=o.invite_code
            and r.network=o.network
            and r.recipient_wallet=o.recipient_wallet
            and r.amount_wei=s.base_amount_wei
            and r.paid_at is not null
        )
      )
    );

  return v_amount;
end;
$function$;

create or replace function public.read_reward_x_promotion_cohort_released_wei(
  p_network text,
  p_app_id text,
  p_reward_cohort_round_id bigint,
  p_allocation_receipt_id bigint
)
returns numeric
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(p_network));
  v_app_id text := lower(btrim(p_app_id));
  v_receipt public.vebetter_round_allocations%rowtype;
  v_amount numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;
  if v_app_id<>v_veinvite_app_id then
    raise exception 'REWARD_X_PROMOTION_APP_MISMATCH';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id=p_allocation_receipt_id
    and a.network=v_network
    and a.app_id=v_app_id;

  if not found
     or v_receipt.vebetter_round_id+1<>p_reward_cohort_round_id then
    raise exception 'REWARD_X_PROMOTION_SOURCE_MISMATCH';
  end if;

  -- A released promotion offsets cohort commitment only while its original
  -- queue reservation is still one of the states counted by
  -- read_reward_cohort_committed_wei(). If the queue row is CANCELLED, the
  -- reservation is already absent from committed value and subtracting the
  -- release again would double-free the same B3TR.
  select coalesce(sum(o.promotion_amount_wei),0)
  into v_amount
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
   and s.mode='LIVE'
  join public.reward_queue_entries q
    on q.id=s.queue_entry_id
   and q.invite_code=o.invite_code
   and q.network=o.network
  where o.network=v_network
    and o.source_reward_cohort_round_id=p_reward_cohort_round_id
    and o.source_allocation_receipt_id=p_allocation_receipt_id
    and o.financial_state='RELEASED'
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');

  return v_amount;
end;
$function$;

revoke all on function public.read_reward_x_promotion_post_base_liability_wei(text,text)
  from public,anon,authenticated;
grant execute on function public.read_reward_x_promotion_post_base_liability_wei(text,text)
  to service_role;

revoke all on function public.read_reward_x_promotion_cohort_released_wei(text,text,bigint,bigint)
  from public,anon,authenticated;
grant execute on function public.read_reward_x_promotion_cohort_released_wei(text,text,bigint,bigint)
  to service_role;

comment on function public.read_reward_x_promotion_post_base_liability_wei(text,text) is
  'Reads post-base X promotion liability. HELD is always counted; RESERVED is also counted once an exact finalized base payout receipt exists, preventing a liability gap before asynchronous activation.';
comment on function public.read_reward_x_promotion_cohort_released_wei(text,text,bigint,bigint) is
  'Reads released X promotion value that offsets an otherwise-counted queue commitment. CANCELLED queue rows are excluded to prevent double release.';
