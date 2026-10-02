begin;

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
    and (
      h.kind not in ('SECURITY_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      or h.event_at <= clock_timestamp() - interval '10 seconds'
    )
    and (p_before_id is null or h.id < p_before_id)
    and not (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED')
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
          and later.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED')
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
    and (
      h.kind not in ('SECURITY_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      or h.event_at <= clock_timestamp() - interval '10 seconds'
    )
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
          and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED')
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
          and later.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED')
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
      h.kind not in ('SECURITY_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      or h.event_at <= clock_timestamp() - interval '10 seconds'
    )
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
            and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED')
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
            and later.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED')
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

comment on function public.get_invite_notification_history(text,bigint,integer) is
  'Returns recipient-aware notification history. Very short security HOLD states are withheld for 10 seconds and suppressed when a final CLEAR or restriction arrives inside that window.';

comment on function public.count_invite_notification_history_unread(text) is
  'Counts recipient-aware unread notifications using the same transient HOLD visibility rules as notification history.';

comment on function public.acknowledge_invite_notification_history(text,bigint[],bigint) is
  'Acknowledges only notifications that are currently user-visible, preserving transient security HOLD debounce behavior.';

commit;
