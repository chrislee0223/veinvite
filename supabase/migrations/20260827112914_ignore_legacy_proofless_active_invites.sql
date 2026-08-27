-- Preserve pre-entry-proof invitation history without letting legacy accepted
-- records permanently occupy the inviter's single active invitation slot.
-- New accepted invitations always carry both an eligibility_check_id and an
-- activation_network, so the invariant remains strict for the current flow.

begin;

drop index if exists public.invitations_one_active_per_inviter;

create unique index invitations_one_active_per_inviter
  on public.invitations (lower(inviter_wallet))
  where (
    status = 'PENDING_ACCEPTANCE'
    or (
      status in ('ACTIVATING','UNDER_REVIEW')
      and eligibility_check_id is not null
      and activation_network is not null
    )
  );

commit;
