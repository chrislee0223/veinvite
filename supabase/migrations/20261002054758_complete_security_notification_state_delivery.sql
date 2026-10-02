begin;

alter table public.invite_notification_history
  add column if not exists recipient_wallet text;

alter table public.invite_notification_history
  drop constraint if exists invite_notification_history_recipient_wallet_check;
alter table public.invite_notification_history
  add constraint invite_notification_history_recipient_wallet_check
  check (
    recipient_wallet is null
    or recipient_wallet ~ '^0x[0-9a-f]{40}$'
  );

create or replace function public.fill_invite_notification_recipient_wallet()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.recipient_wallet is null or btrim(new.recipient_wallet) = '' then
    new.recipient_wallet := lower(btrim(new.inviter_wallet));
  else
    new.recipient_wallet := lower(btrim(new.recipient_wallet));
  end if;
  return new;
end;
$$;

revoke all on function public.fill_invite_notification_recipient_wallet()
from public, anon, authenticated, service_role;

drop trigger if exists invite_notification_history_fill_recipient
on public.invite_notification_history;
create trigger invite_notification_history_fill_recipient
before insert
on public.invite_notification_history
for each row execute function public.fill_invite_notification_recipient_wallet();

create index if not exists invite_notification_history_recipient_id_idx
  on public.invite_notification_history(
    (coalesce(recipient_wallet, inviter_wallet)),
    id desc
  );
create index if not exists invite_notification_history_recipient_event_idx
  on public.invite_notification_history(
    (coalesce(recipient_wallet, inviter_wallet)),
    event_at desc,
    id desc
  );

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
       'SECURITY_RESTRICTION_CONFIRMED'
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
      v_kind,
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

create or replace function public.notify_sybil_v2_referral_security_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
  elsif new.state = 'RESTRICTED'
     and (
       tg_op = 'INSERT'
       or old.state is distinct from 'RESTRICTED'
     ) then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_RESTRICTION_CONFIRMED',
      'preclaim-restricted-r' || new.revision::text,
      new.updated_at
    );
  elsif new.state = 'CLEAR'
     and tg_op = 'UPDATE'
     and old.state in ('HOLD', 'RESTRICTED') then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_REVIEW_CLEARED',
      'preclaim-clear-r' || new.revision::text,
      new.updated_at
    );
  end if;

  return new;
end;
$$;

create or replace function public.get_invite_notification_history(
  p_inviter_wallet text,
  p_before_id bigint default null,
  p_limit integer default 30
)
returns table(
  id bigint,
  invite_code text,
  kind text,
  stage smallint,
  event_at timestamptz,
  reward_amount_wei text,
  dapp_progress smallint,
  collapsed_progress boolean,
  friend_wallet text,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid notification wallet';
  end if;

  return query
  select
    h.id,
    h.invite_code,
    h.kind,
    h.stage,
    h.event_at,
    h.reward_amount_wei,
    h.dapp_progress,
    h.collapsed_progress,
    h.friend_wallet,
    r.read_at
  from public.invite_notification_history h
  left join public.invite_notification_history_reads r
    on r.notification_id = h.id
   and r.inviter_wallet = v_wallet
  where coalesce(h.recipient_wallet, h.inviter_wallet) = v_wallet
    and (p_before_id is null or h.id < p_before_id)
    and not (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind = 'SECURITY_RESTRICTION_CONFIRMED'
          and later.event_at >= h.event_at
          and later.event_at <= h.event_at + interval '10 seconds'
      )
    )
    and not (
      h.kind = 'SECURITY_INVITER_HOLD'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind = 'SECURITY_INVITER_RESTRICTED'
          and later.event_at >= h.event_at
          and later.event_at <= h.event_at + interval '10 seconds'
      )
    )
  order by h.id desc
  limit v_limit;
end;
$$;

create or replace function public.count_invite_notification_history_unread(
  p_inviter_wallet text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_count bigint;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid notification wallet';
  end if;

  select count(*)
  into v_count
  from public.invite_notification_history h
  where coalesce(h.recipient_wallet, h.inviter_wallet) = v_wallet
    and not exists (
      select 1
      from public.invite_notification_history_reads r
      where r.notification_id = h.id
        and r.inviter_wallet = v_wallet
    )
    and not (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind = 'SECURITY_RESTRICTION_CONFIRMED'
          and later.event_at >= h.event_at
          and later.event_at <= h.event_at + interval '10 seconds'
      )
    )
    and not (
      h.kind = 'SECURITY_INVITER_HOLD'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind = 'SECURITY_INVITER_RESTRICTED'
          and later.event_at >= h.event_at
          and later.event_at <= h.event_at + interval '10 seconds'
      )
    );

  return v_count;
end;
$$;

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
    raise exception 'invalid notification wallet';
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
    where coalesce(h.recipient_wallet, h.inviter_wallet) = v_wallet
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
      and not (
        h.kind = 'SECURITY_REVIEW_STARTED'
        and exists (
          select 1
          from public.invite_notification_history later
          where coalesce(later.recipient_wallet, later.inviter_wallet)
                = coalesce(h.recipient_wallet, h.inviter_wallet)
            and later.invite_code = h.invite_code
            and later.kind = 'SECURITY_RESTRICTION_CONFIRMED'
            and later.event_at >= h.event_at
            and later.event_at <= h.event_at + interval '10 seconds'
        )
      )
      and not (
        h.kind = 'SECURITY_INVITER_HOLD'
        and exists (
          select 1
          from public.invite_notification_history later
          where coalesce(later.recipient_wallet, later.inviter_wallet)
                = coalesce(h.recipient_wallet, h.inviter_wallet)
            and later.invite_code = h.invite_code
            and later.kind = 'SECURITY_INVITER_RESTRICTED'
            and later.event_at >= h.event_at
            and later.event_at <= h.event_at + interval '10 seconds'
        )
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
      if v_row.kind not like 'SECURITY_%' then
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

comment on column public.invite_notification_history.recipient_wallet is
  'Wallet that should see this notification. NULL preserves legacy append-only rows and is interpreted as inviter_wallet; new rows are populated on insert.';

comment on function public.notify_sybil_v2_referral_security_history() is
  'Appends recipient-aware pre-claim security lifecycle notifications for HOLD, final restriction, and review clearance.';

commit;