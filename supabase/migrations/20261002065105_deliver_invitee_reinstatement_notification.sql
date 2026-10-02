begin;

create or replace function public.record_invite_security_notification(
  p_invite_code text,
  p_kind text,
  p_event_key text,
  p_event_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_kind text := upper(btrim(p_kind));
  v_event_key text := lower(btrim(p_event_key));
  v_invitation public.invitations%rowtype;
  v_base_dedupe_key text;
  v_inviter_key text;
  v_invitee_key text;
  v_inviter text;
  v_invitee text;
  v_id bigint;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'invalid invite code';
  end if;

  if v_kind not in (
    'SECURITY_REVIEW_STARTED',
    'SECURITY_REVIEW_CLEARED',
    'SECURITY_POST_PAYOUT_REVIEW_STARTED',
    'SECURITY_POST_PAYOUT_REVIEW_CLEARED',
    'SECURITY_RESTRICTION_CONFIRMED',
    'SECURITY_INVITER_WATCH',
    'SECURITY_INVITER_HOLD',
    'SECURITY_INVITER_RESTRICTED',
    'SECURITY_INVITER_ACCESS_RESTORED',
    'SECURITY_REFERRAL_INVALIDATED',
    'SECURITY_REFERRAL_RESTORED'
  ) then
    raise exception 'invalid security notification kind';
  end if;

  if v_event_key !~ '^[a-z0-9:_-]{1,100}$' then
    raise exception 'invalid security notification event key';
  end if;

  if p_event_at is null then
    raise exception 'security notification event time is required';
  end if;

  select *
  into v_invitation
  from public.invitations i
  where i.invite_code = v_code;

  if not found
     or v_invitation.inviter_wallet is null
     or lower(v_invitation.inviter_wallet) !~ '^0x[0-9a-f]{40}$' then
    raise exception 'security notification invitation not found';
  end if;

  v_inviter := lower(v_invitation.inviter_wallet);
  v_invitee := case
    when v_invitation.invitee_wallet is not null
     and lower(v_invitation.invitee_wallet) ~ '^0x[0-9a-f]{40}$'
    then lower(v_invitation.invitee_wallet)
    else null
  end;

  v_base_dedupe_key := concat_ws(
    ':',
    'security-v2',
    v_code,
    v_kind,
    v_event_key
  );
  v_inviter_key := v_base_dedupe_key || ':inviter';
  v_invitee_key := v_base_dedupe_key || ':invitee';

  select h.id
  into v_id
  from public.invite_notification_history h
  where h.invite_code = v_code
    and h.kind = v_kind
    and coalesce(h.recipient_wallet, h.inviter_wallet) = v_inviter
    and h.dedupe_key in (v_base_dedupe_key, v_inviter_key)
  order by h.id
  limit 1;

  if v_id is null then
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
    ) values (
      v_inviter,
      v_inviter,
      v_code,
      v_kind,
      6,
      p_event_at,
      null,
      null,
      false,
      v_invitee,
      v_inviter_key
    )
    on conflict (dedupe_key) do nothing
    returning id into v_id;
  end if;

  if v_id is null then
    select h.id
    into v_id
    from public.invite_notification_history h
    where h.dedupe_key = v_inviter_key
      and h.invite_code = v_code
      and h.kind = v_kind
      and coalesce(h.recipient_wallet, h.inviter_wallet) = v_inviter;
  end if;

  if v_id is null then
    raise exception 'security notification inviter dedupe collision';
  end if;

  if v_invitee is not null
     and v_invitee <> v_inviter
     and v_kind in (
       'SECURITY_REVIEW_STARTED',
       'SECURITY_REVIEW_CLEARED',
       'SECURITY_POST_PAYOUT_REVIEW_STARTED',
       'SECURITY_POST_PAYOUT_REVIEW_CLEARED',
       'SECURITY_RESTRICTION_CONFIRMED',
       'SECURITY_REFERRAL_RESTORED'
     ) then
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
    ) values (
      v_inviter,
      v_invitee,
      v_code,
      case
        when v_kind = 'SECURITY_REFERRAL_RESTORED'
        then 'SECURITY_REVIEW_CLEARED'
        else v_kind
      end,
      6,
      p_event_at,
      null,
      null,
      false,
      v_inviter,
      v_invitee_key
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return v_id;
end;
$$;

comment on function public.record_invite_security_notification(
  text,text,text,timestamptz
) is
  'Writes security notification history for the inviter and, for invitee-facing lifecycle outcomes, the invitee. Reinstatement is presented to the invitee as a neutral review-cleared result.';

commit;
