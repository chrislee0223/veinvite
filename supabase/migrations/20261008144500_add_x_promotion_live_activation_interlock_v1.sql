create or replace function public.guard_reward_x_promotion_live_activation_interlock()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
begin
  if old.reward_x_promotion_enabled=false
     and new.reward_x_promotion_enabled=true then
    raise exception 'REWARD_X_PROMOTION_LIVE_ACTIVATION_NOT_READY';
  end if;

  return new;
end;
$function$;

drop trigger if exists reward_x_promotion_live_activation_interlock
  on public.reward_runtime_config;
create trigger reward_x_promotion_live_activation_interlock
before update of reward_x_promotion_enabled
on public.reward_runtime_config
for each row
execute function public.guard_reward_x_promotion_live_activation_interlock();

revoke all on function public.guard_reward_x_promotion_live_activation_interlock()
  from public,anon,authenticated,service_role;

comment on function public.guard_reward_x_promotion_live_activation_interlock() is
  'Temporary hard interlock. LIVE X promotion activation is forbidden until a later reviewed migration explicitly replaces this guard after the base payout and immutable promotion payout proof paths are complete.';

create or replace function public.create_reward_x_promotion_live_split_from_queue()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_invitation public.invitations%rowtype;
  v_calc record;
begin
  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  -- Dormant while LIVE is disabled. This makes the foundation safe to deploy
  -- before the payout path is ready.
  if not v_cfg.reward_x_promotion_enabled then
    return new;
  end if;

  if v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_LIVE_START_MISSING';
  end if;

  if v_cfg.reward_x_promotion_policy_version<>'x-promotion-split-v1' then
    raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
  end if;

  if new.reserved_amount_wei is null
     or new.reserved_amount_wei<=0
     or new.reserved_at is null then
    return new;
  end if;

  -- Grandfather reservations created before the immutable LIVE boundary.
  if new.reserved_at<v_cfg.reward_x_promotion_live_started_at then
    return new;
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found
     or v_invitation.reward_cohort_round_id is null
     or v_invitation.reward_funding_allocation_receipt_id is null
     or lower(v_invitation.inviter_wallet)<>lower(new.recipient_wallet)
     or v_invitation.activation_network<>new.network then
    raise exception 'REWARD_X_PROMOTION_LIVE_SOURCE_MISSING';
  end if;

  select * into v_calc
  from public.calculate_reward_x_promotion_split_v1(
    new.reserved_amount_wei
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
    v_cfg.reward_x_promotion_policy_version,
    v_calc.promotion_rate_bps,
    v_calc.promotion_cap_wei
  );

  return new;
end;
$function$;

drop trigger if exists reward_queue_create_x_promotion_live_split
  on public.reward_queue_entries;
create trigger reward_queue_create_x_promotion_live_split
after insert on public.reward_queue_entries
for each row
execute function public.create_reward_x_promotion_live_split_from_queue();

revoke all on function public.create_reward_x_promotion_live_split_from_queue()
  from public,anon,authenticated,service_role;

comment on function public.create_reward_x_promotion_live_split_from_queue() is
  'Dormant fail-closed LIVE split creation. Once a later reviewed migration removes the activation interlock, each new post-boundary fixed net reservation must create its exact LIVE base/promotion split in the same transaction or the reservation insert rolls back.';
