-- Recovered from verified Production migration 20261008161409.
-- This fail-closed authority was applied before the repository copy existed.

create or replace function public.read_reward_batch_transfer_amount_wei_v1(
  p_invite_code text
)
returns numeric
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_cfg public.reward_runtime_config%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code=v_code;

  if not found
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<=0
     or v_queue.reserved_at is null then
    raise exception 'REWARD_BATCH_RESERVATION_MISSING';
  end if;

  if not v_cfg.reward_x_promotion_enabled then
    return v_queue.reserved_amount_wei;
  end if;

  if v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_LIVE_START_MISSING';
  end if;

  if v_queue.reserved_at<v_cfg.reward_x_promotion_live_started_at then
    return v_queue.reserved_amount_wei;
  end if;

  select * into v_split
  from public.reward_x_promotion_splits s
  where s.invite_code=v_code
    and s.mode='LIVE';

  if not found then
    raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISSING';
  end if;

  if v_split.queue_entry_id<>v_queue.id
     or v_split.network<>v_queue.network
     or v_split.recipient_wallet<>lower(v_queue.recipient_wallet)
     or v_split.reservation_amount_wei<>v_queue.reserved_amount_wei
     or v_split.policy_version<>v_cfg.reward_x_promotion_policy_version
     or v_split.base_amount_wei<=0
     or v_split.base_amount_wei+v_split.promotion_amount_wei<>v_queue.reserved_amount_wei then
    raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISMATCH';
  end if;

  if v_split.promotion_amount_wei>0 then
    select * into v_obligation
    from public.reward_x_promotion_obligations o
    where o.split_id=v_split.id
      and o.invite_code=v_code;

    if not found
       or v_obligation.network<>v_split.network
       or v_obligation.recipient_wallet<>v_split.recipient_wallet
       or v_obligation.promotion_amount_wei<>v_split.promotion_amount_wei
       or v_obligation.financial_state<>'RESERVED' then
      raise exception 'REWARD_X_PROMOTION_OBLIGATION_NOT_RESERVED';
    end if;
  end if;

  return v_split.base_amount_wei;
end;
$function$;

revoke all on function public.read_reward_batch_transfer_amount_wei_v1(text)
  from public,anon,authenticated;
grant execute on function public.read_reward_batch_transfer_amount_wei_v1(text)
  to service_role;

create or replace function public.validate_reward_payout_x_promotion_amount_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_queue public.reward_queue_entries%rowtype;
  v_expected numeric(78,0);
begin
  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code=new.invite_code;

  if not found or v_queue.reserved_amount_wei is null then
    return new;
  end if;

  if lower(new.recipient_wallet)<>lower(v_queue.recipient_wallet) then
    raise exception 'REWARD_PAYOUT_RECIPIENT_QUEUE_MISMATCH';
  end if;

  v_expected :=
    public.read_reward_batch_transfer_amount_wei_v1(new.invite_code);

  if new.amount_wei<>v_expected then
    raise exception 'REWARD_PAYOUT_X_PROMOTION_AMOUNT_MISMATCH';
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_reward_payout_x_promotion_amount_v1()
  from public,anon,authenticated,service_role;

drop trigger if exists validate_reward_payout_x_promotion_amount_v1_trigger
  on public.reward_payouts;
create trigger validate_reward_payout_x_promotion_amount_v1_trigger
before insert on public.reward_payouts
for each row execute function public.validate_reward_payout_x_promotion_amount_v1();
