-- Preserve slot provenance in the append-only unified event ledger.
-- Existing invitations are not rewritten: they receive an explicit BACKFILL
-- event documenting that the dormant two-slot migration mapped them to the
-- current v1 concurrency slot 1.

create or replace function public.capture_invitation_slot_event_for_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  perform public.append_veinvite_event(
    'INVITE_SLOT_RESERVED',
    new.created_at,
    'invitations',
    new.id::text,
    'INSERT',
    'LIVE',
    new.id,
    new.invite_code,
    new.inviter_wallet,
    new.invitee_wallet,
    new.activation_network,
    null,
    new.activation_block,
    null,
    'live:invitations:' || new.id::text || ':invite_slot',
    jsonb_build_object(
      'invite_slot', new.invite_slot,
      'slot_semantics', 'invitation_concurrency'
    )
  );
  return new;
end;
$$;
revoke all on function public.capture_invitation_slot_event_for_ledger()
  from public, anon, authenticated, service_role;

drop trigger if exists invitations_capture_slot_event on public.invitations;
create trigger invitations_capture_slot_event
after insert on public.invitations
for each row execute function public.capture_invitation_slot_event_for_ledger();

select public.append_veinvite_event(
  'INVITE_SLOT_BACKFILLED',
  i.created_at,
  'invitations',
  i.id::text,
  'BACKFILL',
  'BACKFILL',
  i.id,
  i.invite_code,
  i.inviter_wallet,
  i.invitee_wallet,
  i.activation_network,
  null,
  i.activation_block,
  null,
  'backfill:invitations:' || i.id::text || ':invite_slot:v1',
  jsonb_build_object(
    'invite_slot', i.invite_slot,
    'slot_semantics', 'invitation_concurrency',
    'reason', 'two_slot_foundation',
    'original_policy', 'single_active_invite'
  )
)
from public.invitations i;

-- Network placement is intentionally a different append-only event. This lets
-- future Infinity Canvas/network-score reconstruction distinguish a reusable
-- invite concurrency slot from a permanent parent-child placement decision.
create or replace function public.capture_referral_slot_assignment_event_for_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_relationship public.referral_relationships%rowtype;
begin
  select *
    into v_relationship
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
    new.parent_wallet,
    new.child_wallet,
    v_relationship.network,
    null,
    v_relationship.relationship_effective_block,
    null,
    'live:referral_slot_assignments:' || new.id::text,
    jsonb_build_object(
      'relationship_id', new.relationship_id,
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

drop trigger if exists referral_slot_assignments_capture_unified_event_ledger
  on public.referral_slot_assignments;
create trigger referral_slot_assignments_capture_unified_event_ledger
after insert on public.referral_slot_assignments
for each row execute function public.capture_referral_slot_assignment_event_for_ledger();
