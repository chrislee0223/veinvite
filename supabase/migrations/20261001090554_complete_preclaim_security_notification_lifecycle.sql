create or replace function public.notify_sybil_v2_referral_security_history()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
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

  if new.state = 'RESTRICTED'
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
  end if;

  return new;
end;
$function$;

revoke all on function public.notify_sybil_v2_referral_security_history()
from public, anon, authenticated;

comment on function public.notify_sybil_v2_referral_security_history() is
  'Appends inviter-facing pre-claim Sybil lifecycle notifications when a referral enters HOLD or is finally RESTRICTED.';
