-- Final pre-release hardening for permanent referral links.
--
-- The new referral tables are server-only surfaces. Keep them aligned with the
-- rest of VeInvite's sensitive data model by enabling RLS with no client
-- policies, while retaining explicit service-role grants from the rollout
-- migration.

alter table public.referral_links enable row level security;
alter table public.referral_link_attempts enable row level security;

-- Cover the invitation foreign key used when an activation attempt produced a
-- concrete invitation. This avoids expensive FK maintenance/lookups as the
-- attempt ledger grows.
create index referral_link_attempts_invitation_idx
  on public.referral_link_attempts (invitation_id)
  where invitation_id is not null;

-- A BLOCKED v2 referral releases reusable concurrency capacity. Once that slot
-- can be reassigned to another friend, silently changing the old relationship
-- back to CLEAR/REVIEW would make two historical rows compete for the same
-- immutable invite_slot. Therefore BLOCKED is terminal for permanent-link
-- referrals. Legacy invitation behavior is intentionally unchanged.
create or replace function public.prevent_released_v2_blocked_slot_reactivation()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if old.referral_link_id is not null
     and old.sybil_status = 'BLOCKED'
     and new.sybil_status is distinct from old.sybil_status then
    raise exception 'BLOCKED permanent-referral decision is final after slot release';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_released_v2_blocked_slot_reactivation()
  from public, anon, authenticated, service_role;

drop trigger if exists invitations_lock_released_v2_blocked_slot
  on public.invitations;

create trigger invitations_lock_released_v2_blocked_slot
before update of sybil_status
on public.invitations
for each row
execute function public.prevent_released_v2_blocked_slot_reactivation();
