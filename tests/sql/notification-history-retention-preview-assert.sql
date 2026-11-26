do $qa$
declare w text:='0x'||repeat('a',40); other text:='0x'||repeat('b',40); review_id bigint; ready_id bigint; paid_id bigint; watch_id bigint; legacy_id bigint;
begin
 select id into legacy_id from public.invite_notification_history where dedupe_key='qa-notify-legacy-progress';
 if not exists(select 1 from public.get_invite_notification_history(w,null,50) x where x.id=legacy_id and x.read_at is not null) then raise exception 'legacy display changed'; end if;
 if exists(select 1 from public.invite_notification_history_reads where notification_id=legacy_id) then raise exception 'fake legacy read'; end if;
 insert into public.invite_notification_history(inviter_wallet,recipient_wallet,invite_code,kind,stage,event_at,created_at,dedupe_key)
 values(w,w,'QAABCDE','SECURITY_REVIEW_STARTED',6,now()-interval '1 minute',now()-interval '1 minute','qa-notify-new-review') returning id into review_id;
 insert into public.invite_notification_history(inviter_wallet,recipient_wallet,invite_code,kind,stage,event_at,created_at,dedupe_key)
 values(w,w,'QAABCDE','REWARD_READY',4,now()-interval '1 minute',now()-interval '1 minute','qa-notify-new-ready') returning id into ready_id;
 if not exists(select 1 from public.get_invite_notification_history(w,null,50) x where x.id=review_id and x.kind='SECURITY_REVIEW_STARTED' and x.read_at is null) then raise exception 'review absent'; end if;
 insert into public.invite_notification_history(inviter_wallet,recipient_wallet,invite_code,kind,stage,event_at,created_at,dedupe_key)
 values(w,w,'QAABCDE','SECURITY_RESTRICTION_CONFIRMED',6,now()-interval '55 seconds',now(),'qa-notify-new-terminal');
 insert into public.invite_notification_history(inviter_wallet,recipient_wallet,invite_code,kind,stage,event_at,created_at,dedupe_key)
 values(w,w,'QAABCDE','REWARD_PAID',5,now(),now(),'qa-notify-new-paid') returning id into paid_id;
 insert into public.invite_notification_history(inviter_wallet,recipient_wallet,invite_code,kind,stage,event_at,created_at,dedupe_key)
 values(w,w,'QAABCDE','SECURITY_INVITER_WATCH',6,now(),now(),'qa-notify-new-watch') returning id into watch_id;
 if(select count(*) from public.get_invite_notification_history(w,null,50) x where x.id in(review_id,ready_id) and x.read_at is null)<>2 then raise exception 'old delivered notice hidden or auto-read'; end if;
 if public.count_invite_notification_history_unread(w)<>(select count(*) from public.get_invite_notification_history(w,null,50) x where x.read_at is null) then raise exception 'list/count mismatch'; end if;
 if(public.acknowledge_invite_notification_history(other,array[review_id],null)->>'acknowledged')::integer<>0 then raise exception 'cross-wallet read'; end if;
 if(public.acknowledge_invite_notification_history(w,array[review_id],null)->>'acknowledged')::integer<>1 then raise exception 'read failed'; end if;
 if(public.acknowledge_invite_notification_history(w,array[review_id],null)->>'acknowledged')::integer<>0 then raise exception 'duplicate read'; end if;
 perform public.acknowledge_invite_notification_history(w,null,watch_id);
 if exists(select 1 from public.invite_notification_history_reads where notification_id in(paid_id,watch_id)) then raise exception 'mark-all read receipt or internal watch'; end if;
 if not exists(select 1 from public.get_invite_notification_history(w,null,50) x where x.id=ready_id and x.read_at is not null) then raise exception 'history mark-all failed'; end if;
 if(public.acknowledge_invite_notification_history(w,array[paid_id],null)->>'acknowledged')::integer<>1 then raise exception 'receipt-specific read failed'; end if;
 if has_function_privilege('anon','public.get_invite_notification_history(text,bigint,integer)','EXECUTE') or has_function_privilege('authenticated','public.acknowledge_invite_notification_history(text,bigint[],bigint)','EXECUTE') then raise exception 'privilege leak'; end if;
 if has_schema_privilege('service_role','notification_history_private','USAGE') then raise exception 'private schema exposed'; end if;
end
$qa$;