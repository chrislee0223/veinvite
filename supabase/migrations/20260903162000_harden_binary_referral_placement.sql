-- Harden the dormant binary-network placement ledger before any placement rows
-- exist in Production. Invitation concurrency remains a separate concept.

alter table public.referral_slot_assignments
  drop constraint referral_slot_assignments_slot_check;

alter table public.referral_slot_assignments
  add constraint referral_slot_assignments_slot_check
  check (slot in (1, 2));

comment on column public.referral_slot_assignments.slot is
'Permanent binary referral-network placement slot: 1 or 2 only. This is not the reusable invitations.invite_slot concurrency field.';

create or replace function public.validate_referral_slot_assignment()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
    v_parent text;
    v_child text;
    v_relationship_effective_at timestamptz;
begin
    select lower(r.parent_wallet),
           lower(r.child_wallet),
           r.relationship_effective_at
      into v_parent, v_child, v_relationship_effective_at
    from public.referral_relationships r
    where r.id = new.relationship_id;

    if not found then
        raise exception 'referral relationship % does not exist', new.relationship_id;
    end if;

    if lower(btrim(new.parent_wallet)) <> v_parent
       or lower(btrim(new.child_wallet)) <> v_child then
        raise exception 'slot assignment wallets do not match canonical referral relationship';
    end if;

    if new.slot not in (1, 2) then
        raise exception 'referral network placement slot must be 1 or 2';
    end if;

    if new.assigned_at < v_relationship_effective_at then
        raise exception 'referral network placement cannot predate the canonical relationship';
    end if;

    if not exists (
        select 1
        from public.qualified_referral_relationships q
        where q.id = new.relationship_id
          and lower(q.parent_wallet) = v_parent
          and lower(q.child_wallet) = v_child
    ) then
        raise exception 'only a qualified VeInvite referral relationship can receive a network placement slot';
    end if;

    new.parent_wallet := v_parent;
    new.child_wallet := v_child;
    return new;
end;
$$;
revoke all on function public.validate_referral_slot_assignment()
  from public, anon, authenticated, service_role;
