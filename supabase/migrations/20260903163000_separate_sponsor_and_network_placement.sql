-- A reusable two-slot invitation system can produce more than two lifetime
-- sponsored invitees. Therefore the immutable sponsor edge (who actually
-- invited the user) must not be forced to equal the binary placement parent.
-- This migration upgrades the still-empty placement ledger before launch so it
-- can support spillover while preserving the canonical sponsor relationship.

do $$
begin
  if exists (select 1 from public.referral_slot_assignments limit 1) then
    raise exception 'referral_slot_assignments must be empty before sponsor/placement separation';
  end if;
end;
$$;

alter table public.referral_slot_assignments
  rename column parent_wallet to sponsor_wallet;

alter table public.referral_slot_assignments
  rename constraint referral_slot_assignments_parent_wallet_check
  to referral_slot_assignments_sponsor_wallet_check;

alter table public.referral_slot_assignments
  add column placement_parent_wallet text not null;

alter table public.referral_slot_assignments
  add constraint referral_slot_assignments_placement_parent_wallet_check
  check (placement_parent_wallet ~ '^0x[0-9a-f]{40}$');

alter table public.referral_slot_assignments
  add constraint referral_slot_assignments_placement_parent_child_check
  check (placement_parent_wallet <> child_wallet);

drop index public.referral_slot_assignments_parent_slot_key;

create unique index referral_slot_assignments_placement_parent_slot_key
  on public.referral_slot_assignments (lower(placement_parent_wallet), slot);

create index referral_slot_assignments_sponsor_idx
  on public.referral_slot_assignments (lower(sponsor_wallet), assigned_at, id);

comment on table public.referral_slot_assignments is
'Append-only binary network placement ledger. sponsor_wallet preserves who actually invited the child; placement_parent_wallet is the possibly different binary-tree parent used for Infinity Canvas/network placement. The two must never be conflated.';
comment on column public.referral_slot_assignments.sponsor_wallet is
'Canonical inviter from referral_relationships. Immutable sponsorship provenance.';
comment on column public.referral_slot_assignments.placement_parent_wallet is
'Binary-tree parent for network placement. May equal sponsor_wallet or a wallet already inside that sponsor downline when spillover placement is used.';

create or replace function public.validate_referral_slot_assignment()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
    v_sponsor text;
    v_child text;
    v_relationship_effective_at timestamptz;
begin
    select lower(r.parent_wallet),
           lower(r.child_wallet),
           r.relationship_effective_at
      into v_sponsor, v_child, v_relationship_effective_at
    from public.referral_relationships r
    where r.id = new.relationship_id;

    if not found then
        raise exception 'referral relationship % does not exist', new.relationship_id;
    end if;

    if lower(btrim(new.sponsor_wallet)) <> v_sponsor
       or lower(btrim(new.child_wallet)) <> v_child then
        raise exception 'slot assignment sponsor/child do not match canonical referral relationship';
    end if;

    new.sponsor_wallet := v_sponsor;
    new.child_wallet := v_child;
    new.placement_parent_wallet := lower(btrim(new.placement_parent_wallet));

    if new.slot not in (1, 2) then
        raise exception 'referral network placement slot must be 1 or 2';
    end if;

    if new.placement_parent_wallet = v_child then
        raise exception 'referral network placement cannot parent a wallet to itself';
    end if;

    if new.assigned_at < v_relationship_effective_at then
        raise exception 'referral network placement cannot predate the canonical relationship';
    end if;

    if not exists (
        select 1
        from public.qualified_referral_relationships q
        where q.id = new.relationship_id
          and lower(q.parent_wallet) = v_sponsor
          and lower(q.child_wallet) = v_child
    ) then
        raise exception 'only a qualified VeInvite referral relationship can receive a network placement slot';
    end if;

    -- Spillover is allowed only inside the sponsor's already-built placement
    -- subtree. This prevents a valid sponsorship edge from being attached to an
    -- unrelated network component while still allowing the placement parent to
    -- differ from the actual inviter.
    if new.placement_parent_wallet <> v_sponsor
       and not exists (
          with recursive sponsor_downline(wallet) as (
            select v_sponsor
            union
            select lower(a.child_wallet)
            from public.referral_slot_assignments a
            join sponsor_downline d
              on lower(a.placement_parent_wallet) = d.wallet
          )
          select 1
          from sponsor_downline
          where wallet = new.placement_parent_wallet
       ) then
        raise exception 'placement parent must be the sponsor or an existing wallet in the sponsor placement downline';
    end if;

    -- Independent placement-cycle protection. Sponsor relationships have their
    -- own cycle guard, but placement can diverge from sponsorship under
    -- spillover and therefore requires a separate graph check.
    if exists (
        with recursive placement_ancestors(wallet) as (
          select new.placement_parent_wallet
          union
          select lower(a.placement_parent_wallet)
          from public.referral_slot_assignments a
          join placement_ancestors p
            on lower(a.child_wallet) = p.wallet
        )
        select 1
        from placement_ancestors
        where wallet = v_child
    ) then
        raise exception 'referral network placement would create a cycle';
    end if;

    return new;
end;
$$;
revoke all on function public.validate_referral_slot_assignment()
  from public, anon, authenticated, service_role;

create or replace function public.capture_referral_slot_assignment_event_for_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_relationship public.referral_relationships%rowtype;
begin
  select * into v_relationship
  from public.referral_relationships
  where id = new.relationship_id;

  if not found then
    raise exception 'referral relationship is missing for slot assignment ledger event';
  end if;

  perform public.append_veinvite_event(
    'REFERRAL_PLACEMENT_SLOT_ASSIGNED',
    new.assigned_at,
    'referral_slot_assignments',
    new.id::text,
    'INSERT',
    'LIVE',
    v_relationship.source_invitation_id,
    v_relationship.source_invite_code,
    new.sponsor_wallet,
    new.child_wallet,
    v_relationship.network,
    null,
    v_relationship.relationship_effective_block,
    null,
    'live:referral_slot_assignments:' || new.id::text,
    jsonb_build_object(
      'relationship_id', new.relationship_id,
      'sponsor_wallet', new.sponsor_wallet,
      'placement_parent_wallet', new.placement_parent_wallet,
      'placement_slot', new.slot,
      'slot_semantics', 'network_placement',
      'assignment_version', new.assignment_version,
      'assigned_by', new.assigned_by,
      'source_snapshot', new.source_snapshot
    )
  );

  return new;
end;
$$;
revoke all on function public.capture_referral_slot_assignment_event_for_ledger()
  from public, anon, authenticated, service_role;

create or replace view public.qualified_referral_network_edges
with (security_invoker = true)
as
select
  q.id as relationship_id,
  q.parent_wallet as sponsor_wallet,
  q.child_wallet,
  q.source_invitation_id,
  q.source_invite_code,
  q.relationship_effective_at,
  q.relationship_effective_block,
  q.rule_version,
  q.source_kind,
  q.resolved_entry_class,
  q.resolved_outcome,
  q.eligibility_source,
  q.resolved_network,
  q.resolved_network_source,
  i.invite_slot as invitation_slot,
  a.placement_parent_wallet,
  a.slot as placement_slot,
  a.assignment_version as placement_assignment_version,
  a.assigned_at as placement_assigned_at,
  a.assigned_by as placement_assigned_by
from public.qualified_referral_relationships q
join public.invitations i
  on i.id = q.source_invitation_id
left join public.referral_slot_assignments a
  on a.relationship_id = q.id;

revoke all on table public.qualified_referral_network_edges from public, anon, authenticated;
grant select on table public.qualified_referral_network_edges to service_role;

comment on view public.qualified_referral_network_edges is
'Future referral graph read model separating sponsor_wallet, reusable invitation_slot, and optional binary placement_parent_wallet/placement_slot. This supports spillover without rewriting who actually invited whom.';
