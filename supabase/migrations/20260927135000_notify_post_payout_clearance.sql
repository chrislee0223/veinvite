begin;

create or replace function public.notify_sybil_v2_post_payout_security_history()
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
  elsif new.state = 'CLEARED'
     and tg_op = 'UPDATE'
     and old.state is distinct from 'CLEARED' then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_INVITER_ACCESS_RESTORED',
      'postpayout-clear-r' || new.revision::text,
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

do $$
declare
  v_row record;
begin
  for v_row in
    select
      r.invite_code,
      r.revision,
      r.resolved_at
    from public.sybil_v2_post_payout_reviews r
    where r.state = 'CLEARED'
      and r.resolved_at is not null
      and exists (
        select 1
        from public.invite_notification_history h
        where h.invite_code = r.invite_code
          and h.kind = 'SECURITY_REVIEW_STARTED'
      )
      and not exists (
        select 1
        from public.invite_notification_history h
        where h.invite_code = r.invite_code
          and h.kind = 'SECURITY_INVITER_ACCESS_RESTORED'
          and h.dedupe_key =
            'security-v2:' || r.invite_code
            || ':SECURITY_INVITER_ACCESS_RESTORED:postpayout-clear-r'
            || r.revision::text
      )
  loop
    perform public.record_invite_security_notification(
      v_row.invite_code,
      'SECURITY_INVITER_ACCESS_RESTORED',
      'postpayout-clear-r' || v_row.revision::text,
      v_row.resolved_at
    );
  end loop;
end;
$$;

commit;
