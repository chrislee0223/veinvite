create or replace function public.prevent_invitation_referral_identity_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if lower(btrim(new.inviter_wallet)) is distinct from lower(btrim(old.inviter_wallet)) then raise exception 'inviter_wallet is immutable after invitation creation'; end if;
  if new.invite_code is distinct from old.invite_code then raise exception 'invite_code is immutable after invitation creation'; end if;
  if old.invitee_wallet is not null and lower(btrim(new.invitee_wallet)) is distinct from lower(btrim(old.invitee_wallet)) then raise exception 'invitee_wallet is immutable after acceptance'; end if;
  if old.activated_at is not null and new.activated_at is distinct from old.activated_at then raise exception 'activated_at is immutable once set'; end if;
  if old.activation_block is not null and new.activation_block is distinct from old.activation_block then raise exception 'activation_block is immutable once set'; end if;
  if old.activation_network is not null and new.activation_network is distinct from old.activation_network then raise exception 'activation_network is immutable once set'; end if;
  return new;
end;
$$;
revoke all on function public.prevent_invitation_referral_identity_mutation() from public, anon, authenticated, service_role;
drop trigger if exists invitations_lock_referral_identity on public.invitations;
create trigger invitations_lock_referral_identity
before update of inviter_wallet, invitee_wallet, invite_code, activated_at, activation_block, activation_network
on public.invitations for each row execute function public.prevent_invitation_referral_identity_mutation();

create or replace function public.prevent_referral_network_snapshot_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  raise exception 'referral_network_snapshots is append-only; update/delete is not permitted';
end;
$$;
revoke all on function public.prevent_referral_network_snapshot_mutation() from public, anon, authenticated, service_role;
drop trigger if exists referral_network_snapshots_append_only_update on public.referral_network_snapshots;
create trigger referral_network_snapshots_append_only_update before update on public.referral_network_snapshots for each row execute function public.prevent_referral_network_snapshot_mutation();
drop trigger if exists referral_network_snapshots_append_only_delete on public.referral_network_snapshots;
create trigger referral_network_snapshots_append_only_delete before delete on public.referral_network_snapshots for each row execute function public.prevent_referral_network_snapshot_mutation();

revoke all on table public.referral_relationships from public, anon, authenticated;
revoke all on table public.referral_network_snapshots from public, anon, authenticated;
revoke all on table public.referral_slot_assignments from public, anon, authenticated;
grant select, insert on table public.referral_relationships to service_role;
grant select, insert on table public.referral_network_snapshots to service_role;
grant select, insert on table public.referral_slot_assignments to service_role;
revoke all on function public.capture_referral_network_snapshot(text) from public, anon, authenticated;
grant execute on function public.capture_referral_network_snapshot(text) to service_role;
