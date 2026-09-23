begin;

alter table public.invite_notification_history
  drop constraint if exists invite_notification_history_kind_check;

alter table public.invite_notification_history
  add constraint invite_notification_history_kind_check
  check (kind in (
    'INVITE_ACCEPTED',
    'DAPP_PROGRESS',
    'VOT3_CONVERTED',
    'REWARD_READY',
    'REWARD_PAID',
    'INVITE_INELIGIBLE',
    'SECURITY_REVIEW_STARTED',
    'SECURITY_RESTRICTION_CONFIRMED'
  ));

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
  v_dedupe_key text;
  v_id bigint;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'invalid invite code';
  end if;

  if v_kind not in (
    'SECURITY_REVIEW_STARTED',
    'SECURITY_RESTRICTION_CONFIRMED'
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

  v_dedupe_key := concat_ws(
    ':',
    'security-v1',
    v_code,
    v_kind,
    v_event_key
  );

  insert into public.invite_notification_history(
    inviter_wallet,
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
    lower(v_invitation.inviter_wallet),
    v_code,
    v_kind,
    6,
    p_event_at,
    null,
    null,
    false,
    case
      when v_invitation.invitee_wallet is not null
       and lower(v_invitation.invitee_wallet) ~ '^0x[0-9a-f]{40}$'
      then lower(v_invitation.invitee_wallet)
      else null
    end,
    v_dedupe_key
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    select h.id
    into v_id
    from public.invite_notification_history h
    where h.dedupe_key = v_dedupe_key
      and h.invite_code = v_code
      and h.kind = v_kind;
  end if;

  if v_id is null then
    raise exception 'security notification dedupe collision';
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_invite_security_notification(
  text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.record_invite_security_notification(
  text,text,text,timestamptz
) to service_role;

create or replace function public.notify_sybil_v2_referral_security_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  if new.state = 'HOLD'
     and (
       tg_op = 'INSERT'
       or old.state is distinct from 'HOLD'
     ) then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_REVIEW_STARTED',
      'preclaim-r' || new.revision::text,
      new.updated_at
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_sybil_v2_referral_security_history()
  from public, anon, authenticated, service_role;

drop trigger if exists sybil_v2_referral_security_notification
  on public.sybil_v2_referral_assessments;
create trigger sybil_v2_referral_security_notification
after insert or update of state, revision
on public.sybil_v2_referral_assessments
for each row execute function public.notify_sybil_v2_referral_security_history();

create or replace function public.notify_sybil_v2_post_payout_security_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  if new.state = 'HOLD'
     and (
       tg_op = 'INSERT'
       or old.state is distinct from 'HOLD'
     ) then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_REVIEW_STARTED',
      'postpayout-r' || new.revision::text,
      new.updated_at
    );
  elsif new.state = 'RESTRICTED'
     and (
       tg_op = 'INSERT'
       or old.state is distinct from 'RESTRICTED'
     ) then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_RESTRICTION_CONFIRMED',
      'postpayout-r' || new.revision::text,
      new.updated_at
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_sybil_v2_post_payout_security_history()
  from public, anon, authenticated, service_role;

drop trigger if exists sybil_v2_post_payout_security_notification
  on public.sybil_v2_post_payout_reviews;
create trigger sybil_v2_post_payout_security_notification
after insert or update of state, revision
on public.sybil_v2_post_payout_reviews
for each row execute function public.notify_sybil_v2_post_payout_security_history();

create or replace function public.acknowledge_invite_notification_history(
  p_inviter_wallet text,
  p_ids bigint[] default null,
  p_through_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_row public.invite_notification_history%rowtype;
  v_count integer := 0;
  v_stage integer;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid inviter wallet';
  end if;

  if (p_ids is null and p_through_id is null)
     or (p_ids is not null and p_through_id is not null) then
    raise exception 'choose ids or through id';
  end if;

  if p_ids is not null then
    if cardinality(p_ids) < 1 or cardinality(p_ids) > 100 then
      raise exception 'invalid notification id count';
    end if;
  elsif p_through_id is null or p_through_id < 1 then
    raise exception 'invalid through id';
  end if;

  for v_row in
    select h.*
    from public.invite_notification_history h
    where h.inviter_wallet = v_wallet
      and (
        (p_ids is not null and h.id = any(p_ids))
        or (
          p_through_id is not null
          and h.id <= p_through_id
          and h.kind <> 'REWARD_PAID'
        )
      )
      and not exists (
        select 1
        from public.invite_notification_history_reads r
        where r.notification_id = h.id
      )
    order by h.id
  loop
    insert into public.invite_notification_history_reads(
      notification_id,
      inviter_wallet,
      read_at
    ) values (
      v_row.id,
      v_wallet,
      now()
    )
    on conflict (notification_id) do nothing;

    if found then
      if v_row.kind not in (
        'SECURITY_REVIEW_STARTED',
        'SECURITY_RESTRICTION_CONFIRMED'
      ) then
        v_stage := case
          when v_row.kind = 'DAPP_PROGRESS'
            and coalesce(v_row.dapp_progress, 0) < 3
          then null
          else v_row.stage
        end;

        perform public.acknowledge_invite_notification_v2(
          v_row.invite_code,
          v_wallet,
          v_stage,
          v_row.dapp_progress,
          v_row.kind = 'REWARD_READY'
        );
      end if;

      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('acknowledged', v_count);
end;
$$;

revoke all on function public.acknowledge_invite_notification_history(
  text,bigint[],bigint
) from public, anon, authenticated;
grant execute on function public.acknowledge_invite_notification_history(
  text,bigint[],bigint
) to service_role;

commit;
