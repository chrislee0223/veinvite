create or replace function public.activate_reward_x_promotion_obligation_v1(
  p_invite_code text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_payout public.reward_payouts%rowtype;
  v_invitation public.invitations%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_code is null or v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || v_code,0)
  );

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.invite_code=v_code
  for update;

  if not found then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_MISSING';
  end if;

  if v_obligation.financial_state='HELD' then
    return jsonb_build_object(
      'activated',true,'reason','ALREADY_HELD','inviteCode',v_code,
      'amountWei',v_obligation.promotion_amount_wei::text,
      'heldAt',v_obligation.held_at
    );
  end if;

  if v_obligation.financial_state<>'RESERVED' then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_NOT_RESERVABLE';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits s
  where s.id=v_obligation.split_id and s.mode='LIVE';

  if not found then
    raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISSING';
  end if;

  select * into v_payout
  from public.reward_payouts p
  where p.invite_code=v_code and p.status='PAID';

  if not found
     or v_payout.amount_wei<>v_split.base_amount_wei
     or v_payout.paid_at is null then
    raise exception 'REWARD_X_PROMOTION_BASE_PAYOUT_MISMATCH';
  end if;

  if not exists (
    select 1
    from public.reward_receipts r
    where r.payout_id=v_payout.id
      and r.invite_code=v_code
      and r.network=v_obligation.network
      and r.recipient_wallet=v_obligation.recipient_wallet
      and r.amount_wei=v_split.base_amount_wei
      and r.paid_at is not null
  ) then
    raise exception 'REWARD_X_PROMOTION_BASE_RECEIPT_MISSING';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=v_code;

  if not found
     or public.is_sybil_v2_referral_invalidated(v_code,v_obligation.network)
     or exists (
       select 1
       from public.sybil_v2_wallet_restrictions r
       where r.network=v_obligation.network
         and r.status='ACTIVE'
         and r.wallet_address in (
           lower(v_obligation.recipient_wallet),
           lower(v_invitation.invitee_wallet)
         )
     ) then
    raise exception 'REWARD_X_PROMOTION_SECURITY_NOT_CLEAR';
  end if;

  -- Do not start a promotion hold while the referral is in a temporary
  -- Sybil HOLD/review state. The same current-clearance authority is used by
  -- final verification and payout signing, so the user-facing 24h offer is
  -- not opened before the referral is currently safe to reward.
  if not public.reward_x_promotion_security_clear_v1(
    v_code,
    v_obligation.network
  ) then
    raise exception 'REWARD_X_PROMOTION_SECURITY_NOT_CLEAR';
  end if;

  update public.reward_x_promotion_obligations o
  set financial_state='HELD',held_at=v_now,updated_at=v_now
  where o.id=v_obligation.id
  returning * into v_obligation;

  return jsonb_build_object(
    'activated',true,'reason','HELD','inviteCode',v_code,
    'amountWei',v_obligation.promotion_amount_wei::text,
    'heldAt',v_obligation.held_at
  );
end;
$function$;

create or replace function public.validate_reward_x_promotion_opportunity_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_payout public.reward_payouts%rowtype;
  v_invitation public.invitations%rowtype;
begin
  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=new.obligation_id;

  if not found
     or v_obligation.invite_code<>new.invite_code
     or v_obligation.network<>new.network
     or v_obligation.recipient_wallet<>new.recipient_wallet
     or v_obligation.promotion_amount_wei<>new.promotion_amount_wei
     or v_obligation.policy_version<>new.policy_version
     or v_obligation.financial_state<>'HELD'
     or v_obligation.held_at is null
     or new.opened_at<v_obligation.held_at then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_OBLIGATION_MISMATCH';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits x
  where x.id=new.split_id;

  if not found
     or v_split.id<>v_obligation.split_id
     or v_split.invite_code<>new.invite_code
     or v_split.network<>new.network
     or v_split.recipient_wallet<>new.recipient_wallet
     or v_split.promotion_amount_wei<>new.promotion_amount_wei
     or v_split.policy_version<>new.policy_version
     or v_split.policy_version<>'x-promotion-split-v1'
     or v_split.mode<>'LIVE' then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_SPLIT_MISMATCH';
  end if;

  if new.offer_window_seconds<>86400
     or new.post_deadline_at<>
        new.opened_at+make_interval(secs=>new.offer_window_seconds) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_WINDOW_MISMATCH';
  end if;

  select * into v_payout
  from public.reward_payouts p
  where p.invite_code=new.invite_code
    and p.status='PAID';

  if not found
     or v_payout.amount_wei<>v_split.base_amount_wei
     or v_payout.paid_at is null
     or not exists (
       select 1
       from public.reward_receipts r
       where r.payout_id=v_payout.id
         and r.invite_code=new.invite_code
         and r.network=new.network
         and r.recipient_wallet=new.recipient_wallet
         and r.amount_wei=v_split.base_amount_wei
         and r.paid_at is not null
     ) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_BASE_PROOF_MISSING';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found
     or public.is_sybil_v2_referral_invalidated(new.invite_code,new.network)
     or exists (
       select 1
       from public.sybil_v2_wallet_restrictions r
       where r.network=new.network
         and r.status='ACTIVE'
         and r.wallet_address in (
           lower(new.recipient_wallet),
           lower(v_invitation.invitee_wallet)
         )
     )
     or not public.reward_x_promotion_security_clear_v1(
       new.invite_code,
       new.network
     ) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_SECURITY_NOT_CLEAR';
  end if;

  return new;
end;
$function$;

comment on function public.activate_reward_x_promotion_obligation_v1(text) is
  'Activates a reserved X promotion only after base payout proof and current Sybil clearance; temporary HOLD/review remains RESERVED for retry.';

comment on function public.validate_reward_x_promotion_opportunity_insert() is
  'Guards immutable X promotion opportunity creation, including current Sybil clearance at the 24-hour offer boundary.';
