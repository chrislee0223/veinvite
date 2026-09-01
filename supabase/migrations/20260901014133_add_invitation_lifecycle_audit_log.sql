-- Append-only lifecycle evidence for future invitation state changes.
-- Historical changes before this migration are intentionally not reconstructed.

begin;

create table if not exists public.invitation_lifecycle_audit_log (
  id bigint generated always as identity primary key,
  invitation_id uuid not null,
  recorded_at timestamptz not null default now(),
  operation text not null
    check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_status text null,
  new_status text null,
  inviter_wallet text null,
  invitee_wallet text null,
  invite_code text null,
  old_record jsonb null,
  new_record jsonb null
);

create index if not exists invitation_lifecycle_audit_log_invitation_idx
  on public.invitation_lifecycle_audit_log (
    invitation_id,
    recorded_at desc
  );

create index if not exists invitation_lifecycle_audit_log_inviter_idx
  on public.invitation_lifecycle_audit_log (
    lower(inviter_wallet),
    recorded_at desc
  );

alter table public.invitation_lifecycle_audit_log
  enable row level security;

revoke all on public.invitation_lifecycle_audit_log
  from public, anon, authenticated, service_role;

create or replace function public.log_invitation_lifecycle_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.invitation_lifecycle_audit_log (
    invitation_id,
    operation,
    old_status,
    new_status,
    inviter_wallet,
    invitee_wallet,
    invite_code,
    old_record,
    new_record
  ) values (
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then old.status else null end,
    case when tg_op in ('INSERT', 'UPDATE') then new.status else null end,
    coalesce(new.inviter_wallet, old.inviter_wallet),
    coalesce(new.invitee_wallet, old.invitee_wallet),
    coalesce(new.invite_code, old.invite_code),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

revoke all on function public.log_invitation_lifecycle_change()
  from public, anon, authenticated;
grant execute on function public.log_invitation_lifecycle_change()
  to service_role;

drop trigger if exists trg_invitation_lifecycle_audit
  on public.invitations;
create trigger trg_invitation_lifecycle_audit
after insert or update or delete on public.invitations
for each row execute function public.log_invitation_lifecycle_change();

commit;
