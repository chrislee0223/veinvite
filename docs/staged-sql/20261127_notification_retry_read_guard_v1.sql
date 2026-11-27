-- Prevent old milestone read receipts from advancing a new mission attempt.
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
  -- The reset function locks the same invitation before starting a new attempt.
  -- Serialize a legacy milestone ack against that transition, including silent resets.
  if h.kind in ('DAPP_PROGRESS','VOT3_CONVERTED','REWARD_READY') and h.inviter_wallet=w then
   perform 1 from public.invitations i where i.invite_code=h.invite_code and i.inviter_wallet=w for update;
  end if;
  if h.kind not like 'SECURITY_%' and h.kind not in('X_PROMOTION_PAID','MISSION_PROGRESS_RESET') and h.inviter_wallet=w
   and exists(select 1 from public.invitations i where i.invite_code=h.invite_code and i.inviter_wallet=w)
   and (h.kind not in ('DAPP_PROGRESS','VOT3_CONVERTED','REWARD_READY') or not exists(
     select 1 from reward_admission_bridge.mission_retry_attempts_v1 a
     join public.invitations i on i.id=a.invitation_id
     where i.invite_code=h.invite_code and a.entered_at>h.event_at
   ))
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
