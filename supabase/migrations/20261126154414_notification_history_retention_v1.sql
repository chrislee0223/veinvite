-- Durable notification display, independent of payout/mission/security state.
-- Legacy projections frozen at cutover, preserving real reads and original source.
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.invite_notification_history in share row exclusive mode;
lock table public.invite_notification_history_reads in share row exclusive mode;
create schema notification_history_private;
revoke all on schema notification_history_private from public,anon,authenticated,service_role;
create table notification_history_private.presentation_v1(
 notification_id bigint primary key references public.invite_notification_history(id) on delete restrict,
 visible boolean not null,kind text not null,event_at timestamptz not null,legacy_archived_at timestamptz
);
alter table notification_history_private.presentation_v1 enable row level security;
revoke all on table notification_history_private.presentation_v1 from public,anon,authenticated,service_role;
do $backfill$
declare w text; cursor_id bigint; page_min bigint; page_count integer;
begin
 for w in select distinct coalesce(h.recipient_wallet,h.inviter_wallet) from public.invite_notification_history h loop
  cursor_id:=null;
  loop
   with page as materialized(select * from public.get_invite_notification_history(w,cursor_id,50)),
   inserted as (
    insert into notification_history_private.presentation_v1(notification_id,visible,kind,event_at,legacy_archived_at)
    select p.id,true,p.kind,p.event_at,case when r.notification_id is null then p.read_at else null end
    from page p left join public.invite_notification_history_reads r on r.notification_id=p.id and r.inviter_wallet=w
    on conflict(notification_id) do nothing returning notification_id
   )
   select min(page.id),count(*)::integer into page_min,page_count from page;
   exit when page_count=0;
   cursor_id:=page_min;
   exit when page_count<50;
  end loop;
 end loop;
 -- Restore an already-read hidden row, but do not resurrect undelivered legacy duplicates.
 insert into notification_history_private.presentation_v1(notification_id,visible,kind,event_at)
 select h.id,r.notification_id is not null,h.kind,h.event_at
 from public.invite_notification_history h left join public.invite_notification_history_reads r
 on r.notification_id=h.id and r.inviter_wallet=coalesce(h.recipient_wallet,h.inviter_wallet)
 where greatest(h.created_at,h.event_at)<=clock_timestamp()-interval '10 seconds'
 on conflict(notification_id) do nothing;
end
$backfill$;

-- Once snapshotted, new notices are immutable. Before delivery, retain existing
-- short review debounce and duplicate restriction suppression.
create view notification_history_private.visible_v1 with(security_invoker=true) as
select h.id,h.invite_code,coalesce(p.kind,h.kind) as kind,h.stage,
 coalesce(p.event_at,h.event_at) as event_at,h.reward_amount_wei,h.dapp_progress,
 h.collapsed_progress,h.friend_wallet,coalesce(r.read_at,p.legacy_archived_at) as read_at,
 coalesce(h.recipient_wallet,h.inviter_wallet) as recipient
from public.invite_notification_history h
left join notification_history_private.presentation_v1 p on p.notification_id=h.id
left join public.invite_notification_history_reads r on r.notification_id=h.id
 and r.inviter_wallet=coalesce(h.recipient_wallet,h.inviter_wallet)
where case when p.notification_id is not null then p.visible else
 r.notification_id is not null or (
  not(h.kind='INVITE_INELIGIBLE' and exists(
   select 1 from public.invite_notification_history l where l.invite_code=h.invite_code
    and coalesce(l.recipient_wallet,l.inviter_wallet)=coalesce(h.recipient_wallet,h.inviter_wallet)
    and l.kind='SECURITY_RESTRICTION_CONFIRMED'
    and h.event_at between l.event_at-interval '10 minutes' and l.event_at+interval '10 minutes'
  ))
  and(h.kind not in('SECURITY_REVIEW_STARTED','SECURITY_POST_PAYOUT_REVIEW_STARTED','SECURITY_INVITER_HOLD')
   or(greatest(h.event_at,h.created_at)<=clock_timestamp()-interval '10 seconds'
    and not exists(
     select 1 from public.invite_notification_history l where l.invite_code=h.invite_code and l.id>h.id
     and coalesce(l.recipient_wallet,l.inviter_wallet)=coalesce(h.recipient_wallet,h.inviter_wallet)
     and l.event_at between h.event_at and h.event_at+interval '10 seconds'
     and((h.kind='SECURITY_REVIEW_STARTED' and l.kind in('SECURITY_RESTRICTION_CONFIRMED','SECURITY_REVIEW_CLEARED'))
      or(h.kind='SECURITY_POST_PAYOUT_REVIEW_STARTED' and l.kind in('SECURITY_RESTRICTION_CONFIRMED','SECURITY_POST_PAYOUT_REVIEW_CLEARED'))
      or(h.kind='SECURITY_REVIEW_STARTED' and h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:postpayout-r%'
       and l.kind='SECURITY_INVITER_ACCESS_RESTORED' and l.dedupe_key like 'security-v2:%:SECURITY_INVITER_ACCESS_RESTORED:postpayout-clear-r%')
      or(h.kind='SECURITY_INVITER_HOLD' and l.kind in('SECURITY_INVITER_RESTRICTED','SECURITY_INVITER_ACCESS_RESTORED')))
    )
   )
  )
 )
end;
revoke all on notification_history_private.visible_v1 from public,anon,authenticated,service_role;

-- Keep existing legacy lifecycle acknowledgement predicate unchanged;
-- obsolete notices now fall back to read-only acknowledgement.
CREATE OR REPLACE FUNCTION notification_history_private.acknowledge_legacy_v1(p_inviter_wallet text, p_ids bigint[] DEFAULT NULL::bigint[], p_through_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    -- Operator-cleared, older preclaim review is closed; no user-read mutation.
    and not (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-r%'
      and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
      and exists (
        select 1
        from public.sybil_v2_referral_assessments resolved_review
        join public.invitations inv on inv.invite_code = resolved_review.invite_code
        where resolved_review.invite_code = h.invite_code
          and resolved_review.state = 'CLEAR'
          and resolved_review.updated_at >= h.event_at
          and resolved_review.reason_codes @> '["OPERATOR_CLEARED"]'::jsonb
          and inv.inviter_wallet = h.inviter_wallet
          and inv.sybil_status <> 'BLOCKED'
          and inv.reward_status <> 'FORFEITED'
          and not exists (
            select 1 from public.sybil_v2_wallet_restrictions block
            where block.related_invite_code = h.invite_code
              and block.status = 'ACTIVE'
          )
          and not exists (
            select 1 from public.invite_notification_history later
            where later.invite_code = h.invite_code
              and later.id > h.id
              and later.kind = 'SECURITY_REVIEW_STARTED'
          )
      )
    )
    -- Ignore only past security-review / inviter-hold notices for a finalized
    -- blocked-and-forfeited invitation with a released slot.
    and not (
      h.kind in ('SECURITY_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      and (
        (h.kind = 'SECURITY_INVITER_HOLD')
        or (
          h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-%'
          and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
        )
      )
      and exists (
        select 1
        from public.invitations terminal_invite
        where terminal_invite.invite_code = h.invite_code
          and terminal_invite.inviter_wallet = h.inviter_wallet
          and terminal_invite.status = 'CANCELLED'
          and terminal_invite.sybil_status = 'BLOCKED'
          and terminal_invite.reward_status = 'FORFEITED'
          and terminal_invite.slot_released_at is not null
      )
    )
    -- Terminal security outcomes supersede earlier progress / review notices.
    -- Leave audit/history rows and real read receipts untouched.
    and not (exists (
      select 1
      from public.invite_notification_history final_outcome
      where final_outcome.invite_code = h.invite_code
        and coalesce(final_outcome.recipient_wallet, final_outcome.inviter_wallet)
            = coalesce(h.recipient_wallet, h.inviter_wallet)
        and final_outcome.id > h.id
        and final_outcome.event_at >= h.event_at
        and (
          (h.kind = 'SECURITY_REVIEW_STARTED'
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED', 'SECURITY_REFERRAL_INVALIDATED'))
          or (h.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED'))
          or (h.kind = 'SECURITY_REVIEW_STARTED'
AND h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:postpayout-r%'
AND final_outcome.kind = 'SECURITY_INVITER_ACCESS_RESTORED'
AND final_outcome.dedupe_key like 'security-v2:%:SECURITY_INVITER_ACCESS_RESTORED:postpayout-clear-r%')
          or (h.kind = 'SECURITY_INVITER_HOLD'
            and final_outcome.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED', 'SECURITY_REFERRAL_INVALIDATED'))
          or (h.kind in ('INVITE_ACCEPTED', 'DAPP_PROGRESS', 'VOT3_CONVERTED', 'REWARD_READY')
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REFERRAL_INVALIDATED', 'REWARD_PAID'))
        )
    ))
    -- One blacklist outcome per recipient: retain append-only history while
    -- masking a generic ineligible event generated for the same decision.
    and not (
      h.kind = 'INVITE_INELIGIBLE'
      and exists (
        select 1
        from public.invite_notification_history security_outcome
        where security_outcome.invite_code = h.invite_code
          and security_outcome.kind = 'SECURITY_RESTRICTION_CONFIRMED'
          and coalesce(security_outcome.recipient_wallet, security_outcome.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and h.event_at between security_outcome.event_at - interval '10 minutes'
                             and security_outcome.event_at + interval '10 minutes'
      )
    )
    and (
      h.kind not in ('SECURITY_REVIEW_STARTED', 'SECURITY_POST_PAYOUT_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
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
        h.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'
        and exists (
          select 1
          from public.invite_notification_history later
          where coalesce(later.recipient_wallet, later.inviter_wallet)
                = coalesce(h.recipient_wallet, h.inviter_wallet)
            and later.invite_code = h.invite_code
            and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED')
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
      -- X promotion paid uses its own durable history read row and must
      -- not advance the legacy referral lifecycle stage. Advancing stage 5
      -- here could indirectly suppress an unread core REWARD_PAID notice.
      if v_row.kind not like 'SECURITY_%'
         and v_row.kind <> 'X_PROMOTION_PAID'
         and v_row.kind <> 'MISSION_PROGRESS_RESET' then
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
$function$;
revoke all on function notification_history_private.acknowledge_legacy_v1(text,bigint[],bigint) from public,anon,authenticated,service_role;

create or replace function public.get_invite_notification_history(p_inviter_wallet text,p_before_id bigint default null,p_limit integer default 30)
returns table(id bigint,invite_code text,kind text,stage smallint,event_at timestamptz,reward_amount_wei text,dapp_progress smallint,collapsed_progress boolean,friend_wallet text,read_at timestamptz)
language plpgsql security definer set search_path to 'pg_catalog','public' as $function$
declare w text:=lower(btrim(p_inviter_wallet)); n integer:=greatest(1,least(coalesce(p_limit,30),50));
begin
 if w is null or w !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid notification wallet'; end if;
 insert into notification_history_private.presentation_v1(notification_id,visible,kind,event_at)
 select v.id,true,v.kind,v.event_at from notification_history_private.visible_v1 v
 where v.recipient=w and(p_before_id is null or v.id<p_before_id)
 order by v.id desc limit n on conflict(notification_id) do nothing;
 return query select v.id,v.invite_code,v.kind,v.stage,v.event_at,v.reward_amount_wei,v.dapp_progress,v.collapsed_progress,v.friend_wallet,v.read_at
 from notification_history_private.visible_v1 v join notification_history_private.presentation_v1 p on p.notification_id=v.id
 where v.recipient=w and(p_before_id is null or v.id<p_before_id) order by v.id desc limit n;
end
$function$;

create or replace function public.count_invite_notification_history_unread(p_inviter_wallet text)
returns bigint language plpgsql security definer set search_path to 'pg_catalog','public' as $function$
declare w text:=lower(btrim(p_inviter_wallet)); c bigint;
begin
 if w is null or w !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid notification wallet'; end if;
 -- Internal watch is included solely for compatibility with API subtraction.
 select count(*) into c from notification_history_private.visible_v1 v where v.recipient=w and v.read_at is null;
 return c;
end
$function$;

create or replace function public.acknowledge_invite_notification_history(p_inviter_wallet text,p_ids bigint[] default null,p_through_id bigint default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $function$
declare w text:=lower(btrim(p_inviter_wallet)); h public.invite_notification_history%rowtype; c integer:=0; legacy_result jsonb;
begin
 if w is null or w !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid notification wallet'; end if;
 if(p_ids is null)=(p_through_id is null) then raise exception 'choose ids or through id'; end if;
 if p_ids is not null and(cardinality(p_ids)<1 or cardinality(p_ids)>100) then raise exception 'invalid notification id count'; end if;
 if p_through_id is not null and p_through_id<1 then raise exception 'invalid through id'; end if;
 for h in select source.* from notification_history_private.visible_v1 v
  join public.invite_notification_history source on source.id=v.id
  where v.recipient=w and v.read_at is null and v.kind<>'SECURITY_INVITER_WATCH'
   and((p_ids is not null and v.id=any(p_ids)) or(p_through_id is not null and v.id<=p_through_id and v.kind<>'REWARD_PAID'))
  order by v.id
 loop
  if h.kind not like 'SECURITY_%' and h.kind not in('X_PROMOTION_PAID','MISSION_PROGRESS_RESET') and h.inviter_wallet=w
   and exists(select 1 from public.invitations i where i.invite_code=h.invite_code and i.inviter_wallet=w)
   and not exists(select 1 from public.invite_notification_history reset where reset.invite_code=h.invite_code
     and reset.kind='MISSION_PROGRESS_RESET' and reset.event_at>=h.event_at and reset.id>h.id)
  then
   legacy_result:=notification_history_private.acknowledge_legacy_v1(w,array[h.id],null);
   c:=c+coalesce((legacy_result->>'acknowledged')::integer,0);
  end if;
  insert into public.invite_notification_history_reads(notification_id,inviter_wallet,read_at)
  values(h.id,w,now()) on conflict(notification_id) do nothing;
  if found then c:=c+1; end if;
 end loop;
 return jsonb_build_object('acknowledged',c);
end
$function$;
revoke all on function public.get_invite_notification_history(text,bigint,integer) from public,anon,authenticated;
revoke all on function public.count_invite_notification_history_unread(text) from public,anon,authenticated;
revoke all on function public.acknowledge_invite_notification_history(text,bigint[],bigint) from public,anon,authenticated;
grant execute on function public.get_invite_notification_history(text,bigint,integer) to service_role;
grant execute on function public.count_invite_notification_history_unread(text) to service_role;
grant execute on function public.acknowledge_invite_notification_history(text,bigint[],bigint) to service_role;
