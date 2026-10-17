-- Surface verified X promotion payouts in durable notification history.
-- This migration is notification-only: it never creates, mutates, releases,
-- signs, broadcasts, or settles any reward obligation.

alter table public.invite_notification_history
  drop constraint if exists invite_notification_history_kind_check;

alter table public.invite_notification_history
  add constraint invite_notification_history_kind_check
  check (
    kind = any (array[
      'INVITE_ACCEPTED'::text,
      'DAPP_PROGRESS'::text,
      'VOT3_CONVERTED'::text,
      'REWARD_READY'::text,
      'REWARD_PAID'::text,
      'REWARD_ADJUSTED'::text,
      'X_PROMOTION_PAID'::text,
      'INVITE_INELIGIBLE'::text,
      'SECURITY_REVIEW_STARTED'::text,
      'SECURITY_REVIEW_CLEARED'::text,
      'SECURITY_POST_PAYOUT_REVIEW_STARTED'::text,
      'SECURITY_POST_PAYOUT_REVIEW_CLEARED'::text,
      'SECURITY_RESTRICTION_CONFIRMED'::text,
      'SECURITY_INVITER_WATCH'::text,
      'SECURITY_INVITER_HOLD'::text,
      'SECURITY_INVITER_RESTRICTED'::text,
      'SECURITY_INVITER_ACCESS_RESTORED'::text,
      'SECURITY_REFERRAL_INVALIDATED'::text,
      'SECURITY_REFERRAL_RESTORED'::text
    ])
  );

create or replace function public.reconcile_verified_x_promotion_paid_history(
  p_inviter_wallet text
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_count integer := 0;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid notification wallet';
  end if;

  with verified as (
    select
      r.id as receipt_id,
      r.invite_code,
      r.paid_at,
      r.amount_wei,
      i.invitee_wallet
    from public.reward_x_promotion_receipts r
    join public.reward_x_promotion_obligations o
      on o.id = r.obligation_id
     and o.split_id = r.split_id
     and o.invite_code = r.invite_code
     and o.recipient_wallet = r.recipient_wallet
     and o.promotion_amount_wei = r.amount_wei
     and o.financial_state = 'PAID'
     and o.paid_at = r.paid_at
    join public.reward_x_promotion_splits x
      on x.id = r.split_id
     and x.invite_code = r.invite_code
     and x.recipient_wallet = r.recipient_wallet
     and x.promotion_amount_wei = r.amount_wei
     and x.mode = 'LIVE'
    join public.reward_x_promotion_payout_settlements s
      on s.id = r.settlement_id
     and s.intent_id = r.intent_id
     and s.tx_id = r.tx_id
     and s.paid_at = r.paid_at
    join public.invitations i
      on i.invite_code = r.invite_code
     and lower(i.inviter_wallet) = v_wallet
    where lower(r.recipient_wallet) = v_wallet
      and r.amount_wei > 0
      and r.amount_wei = trunc(r.amount_wei)
      and r.tx_id ~ '^0x[0-9a-f]{64}$'
      and not exists (
        select 1
        from public.invite_notification_history h
        where h.dedupe_key = 'xpromo:v1:' || r.id::text
      )
  ),
  inserted as (
    insert into public.invite_notification_history(
      inviter_wallet,
      recipient_wallet,
      invite_code,
      kind,
      stage,
      event_at,
      reward_amount_wei,
      dapp_progress,
      collapsed_progress,
      friend_wallet,
      dedupe_key
    )
    select
      v_wallet,
      v_wallet,
      v.invite_code,
      'X_PROMOTION_PAID',
      5,
      v.paid_at,
      v.amount_wei::text,
      null,
      false,
      v.invitee_wallet,
      'xpromo:v1:' || v.receipt_id::text
    from verified v
    on conflict (dedupe_key) do nothing
    returning id
  )
  select count(*) into v_count from inserted;

  return v_count;
end;
$function$;

revoke all on function public.reconcile_verified_x_promotion_paid_history(text)
  from public, anon, authenticated;
grant execute on function public.reconcile_verified_x_promotion_paid_history(text)
  to service_role;

comment on function public.reconcile_verified_x_promotion_paid_history(text) is
  'Materializes durable X promotion paid notifications only from finalized immutable X promotion receipts and matching paid obligations/settlements.';
