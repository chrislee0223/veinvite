-- Prepare VeInvite for a future two-simultaneous-invite rollout without
-- changing today's one-active-invite product behavior.
--
-- Important semantic split:
--   invitations.invite_slot = concurrency slot for an invitation (1 or 2)
--   referral_slot_assignments.slot = permanent/derived network placement slot
--
-- These concepts must stay separate so a reusable invitation slot can never
-- silently rewrite the canonical multi-generation referral graph.

alter table public.invitations
  add column invite_slot smallint not null default 1;

alter table public.invitations
  add constraint invitations_invite_slot_check
  check (invite_slot in (1, 2));

comment on column public.invitations.invite_slot is
'Concurrency slot reserved by this invitation. Existing/current VeInvite uses slot 1 only. Slot 2 is schema-ready but remains disabled by the existing one-active-invite invariant until the future two-slot product rollout.';

-- Build the future per-slot race guard now, while deliberately retaining
-- invitations_one_active_per_inviter below. With both indexes present, current
-- Production still allows only one active invitation total. A future two-slot
-- rollout can remove the legacy total-limit index after the API/UI explicitly
-- select slot 1 or 2, without needing another table-shape migration.
create unique index invitations_one_active_per_inviter_slot
  on public.invitations (lower(inviter_wallet), invite_slot)
  where status = 'PENDING_ACCEPTANCE'
     or (
       status in ('ACTIVATING', 'UNDER_REVIEW')
       and eligibility_check_id is not null
       and activation_network is not null
     );

comment on index public.invitations_one_active_per_inviter_slot is
'Future two-slot atomic race guard. The legacy invitations_one_active_per_inviter index intentionally remains in force until the two-slot feature is explicitly enabled.';

-- The invitation slot is referral provenance, so it becomes immutable together
-- with inviter/code and the accepted invitee/checkpoint identity.
create or replace function public.prevent_invitation_referral_identity_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if lower(btrim(new.inviter_wallet)) is distinct from lower(btrim(old.inviter_wallet)) then
    raise exception 'inviter_wallet is immutable after invitation creation';
  end if;
  if new.invite_code is distinct from old.invite_code then
    raise exception 'invite_code is immutable after invitation creation';
  end if;
  if new.invite_slot is distinct from old.invite_slot then
    raise exception 'invite_slot is immutable after invitation creation';
  end if;
  if old.invitee_wallet is not null and lower(btrim(new.invitee_wallet)) is distinct from lower(btrim(old.invitee_wallet)) then
    raise exception 'invitee_wallet is immutable after acceptance';
  end if;
  if old.activated_at is not null and new.activated_at is distinct from old.activated_at then
    raise exception 'activated_at is immutable once set';
  end if;
  if old.activation_block is not null and new.activation_block is distinct from old.activation_block then
    raise exception 'activation_block is immutable once set';
  end if;
  if old.activation_network is not null and new.activation_network is distinct from old.activation_network then
    raise exception 'activation_network is immutable once set';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_invitation_referral_identity_mutation() from public, anon, authenticated, service_role;

drop trigger if exists invitations_lock_referral_identity on public.invitations;
create trigger invitations_lock_referral_identity
before update of inviter_wallet, invitee_wallet, invite_code, invite_slot,
                 activated_at, activation_block, activation_network
on public.invitations
for each row execute function public.prevent_invitation_referral_identity_mutation();

-- Keep the append-only canonical relationship ledger unchanged, but snapshot
-- the invitation concurrency slot for every newly recorded relationship.
-- Existing relationship rows remain immutable and can resolve the slot through
-- their immutable source_invitation_id.
create or replace function public.sync_referral_relationship_from_invitation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_entry_class text;
    v_network text;
begin
    if new.invitee_wallet is null
       or new.activated_at is null
       or new.status not in ('UNDER_REVIEW', 'ACTIVATING', 'COMPLETED') then
        return new;
    end if;

    select e.entry_class, e.network
      into v_entry_class, v_network
    from public.eligibility_check_events e
    where (new.eligibility_check_id is not null and e.id = new.eligibility_check_id)
       or (new.eligibility_check_id is null and e.invite_code = new.invite_code)
    order by case when new.eligibility_check_id is not null and e.id = new.eligibility_check_id then 0 else 1 end,
             e.created_at desc,
             e.id desc
    limit 1;

    insert into public.referral_relationships (
        parent_wallet,
        child_wallet,
        source_invitation_id,
        source_invite_code,
        relationship_effective_at,
        relationship_effective_block,
        network,
        rule_version,
        source_kind,
        slot,
        entry_class_at_activation,
        invitation_created_at,
        source_snapshot
    ) values (
        lower(btrim(new.inviter_wallet)),
        lower(btrim(new.invitee_wallet)),
        new.id,
        new.invite_code,
        new.activated_at,
        new.activation_block,
        coalesce(new.activation_network, v_network),
        'v1_single_invite',
        'live_v1',
        null,
        v_entry_class,
        new.created_at,
        jsonb_build_object(
            'status_at_recording', new.status,
            'invitation_updated_at', new.updated_at,
            'activated_at', new.activated_at,
            'activation_block', new.activation_block,
            'activation_network', new.activation_network,
            'eligibility_check_id', new.eligibility_check_id,
            'resolved_network', coalesce(new.activation_network, v_network),
            'entry_class', v_entry_class,
            'invitation_slot', new.invite_slot
        )
    )
    on conflict (source_invitation_id) do nothing;

    return new;
end;
$$;
revoke all on function public.sync_referral_relationship_from_invitation() from public, anon, authenticated;

comment on column public.referral_relationships.slot is
'Legacy placeholder from the original network-ledger design. Do not mutate canonical relationship rows to assign placement. Use append-only referral_slot_assignments for network placement; invitation concurrency lives on invitations.invite_slot.';

-- Stable future-facing read model. It intentionally exposes invitation
-- concurrency separately from network placement, so Infinity Canvas/network
-- scoring cannot accidentally treat a reusable invite slot as a permanent tree
-- position.
create or replace view public.qualified_referral_network_edges
with (security_invoker = true)
as
select
  q.id as relationship_id,
  q.parent_wallet,
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
'Qualified future referral graph read model. invitation_slot is the reusable invitation concurrency slot; placement_slot is the separately assigned network-tree position. Current Production still permits only one active invitation total.';
