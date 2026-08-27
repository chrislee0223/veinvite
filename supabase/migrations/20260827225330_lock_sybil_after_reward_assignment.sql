-- Freeze the Sybil decision once an invitation is assigned to a reward round.
-- This prevents post-reservation eligibility drift without changing payout math
-- or performing any token transfer.

begin;

create or replace function public.prevent_assigned_reward_sybil_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (
    new.sybil_status is distinct from old.sybil_status
    or new.sybil_risk_level is distinct from old.sybil_risk_level
    or new.sybil_risk_score is distinct from old.sybil_risk_score
    or new.sybil_reason is distinct from old.sybil_reason
    or new.sybil_checked_at is distinct from old.sybil_checked_at
    or new.sybil_source is distinct from old.sybil_source
  ) and exists (
    select 1
    from public.reward_queue_entries q
    where q.invite_code = old.invite_code
      and q.status = 'ASSIGNED'
      and q.assigned_round_id is not null
  ) then
    raise exception 'Sybil decision is locked after reward round assignment for invite %', old.invite_code;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_assigned_reward_sybil_changes()
  from public, anon, authenticated;

drop trigger if exists invitations_lock_sybil_after_reward_assignment
  on public.invitations;
create trigger invitations_lock_sybil_after_reward_assignment
before update of
  sybil_status,
  sybil_risk_level,
  sybil_risk_score,
  sybil_reason,
  sybil_checked_at,
  sybil_source
on public.invitations
for each row execute function public.prevent_assigned_reward_sybil_changes();

commit;
