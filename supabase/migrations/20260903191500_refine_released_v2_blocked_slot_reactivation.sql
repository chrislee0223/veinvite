-- Refine the released-slot guard from the preceding hardening migration.
--
-- BLOCKED releases a permanent-referral concurrency slot, but an operator may
-- still need to correct a false positive. That correction is safe when it does
-- not recreate an active collision. In particular, a correction that resolves
-- directly to COMPLETED does not consume a concurrency slot and must remain
-- possible even if the historical slot number has since been reused.

create or replace function public.prevent_released_v2_blocked_slot_reactivation()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if old.referral_link_id is not null
     and old.sybil_status = 'BLOCKED'
     and new.sybil_status is distinct from old.sybil_status
     and new.status in ('ACTIVATING', 'UNDER_REVIEW')
     and exists (
       select 1
       from public.invitations i
       where i.id <> old.id
         and lower(btrim(i.inviter_wallet)) = lower(btrim(old.inviter_wallet))
         and i.invite_slot = old.invite_slot
         and (
           i.status = 'PENDING_ACCEPTANCE'
           or (
             i.status in ('ACTIVATING', 'UNDER_REVIEW')
             and i.eligibility_check_id is not null
             and i.activation_network is not null
             and i.sybil_status <> 'BLOCKED'
           )
         )
     ) then
    raise exception 'permanent-referral slot % has already been reused by another active invitation', old.invite_slot;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_released_v2_blocked_slot_reactivation()
  from public, anon, authenticated, service_role;
