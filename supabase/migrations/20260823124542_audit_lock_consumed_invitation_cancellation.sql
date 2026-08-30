-- Once an invitee accepts a referral, the inviter cannot cancel the journey
-- underneath them or use cancellation to escape an UNDER_REVIEW state.
-- Cancellation remains available for an unused PENDING_ACCEPTANCE invite.
-- Applied and tested on Preview first.

begin;

create or replace function public.prevent_consumed_invitation_cancellation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status <> 'CANCELLED'
     and new.status = 'CANCELLED'
     and old.invitee_wallet is not null then
    raise exception 'accepted invitation cannot be cancelled';
  end if;

  return new;
end;
$$;

drop trigger if exists invitations_prevent_consumed_cancel
  on public.invitations;

create trigger invitations_prevent_consumed_cancel
before update of status on public.invitations
for each row
execute function public.prevent_consumed_invitation_cancellation();

revoke all on function public.prevent_consumed_invitation_cancellation()
  from public, anon, authenticated;
grant execute on function public.prevent_consumed_invitation_cancellation()
  to service_role;

commit;
