-- VeInvite automatic rewards - Step 2
-- Centralize reward eligibility in the database so every completion path
-- produces the same reward state.
--
-- SAFE: This file does not send B3TR and does not touch reward payouts.

begin;

create or replace function public.sync_invitation_reward_eligibility()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- A completed invitation becomes eligible exactly once unless it has
  -- already been paid or explicitly forfeited.
  if new.status = 'COMPLETED'
     and coalesce(new.reward_status::text, '') not in ('PAID', 'FORFEITED') then
    new.reward_status := 'ELIGIBLE';
    new.reward_eligible_at := coalesce(
      new.reward_eligible_at,
      new.vote_completed_at,
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists invitations_sync_reward_eligibility
  on public.invitations;

create trigger invitations_sync_reward_eligibility
before insert or update
on public.invitations
for each row
execute function public.sync_invitation_reward_eligibility();

-- Repair any already-completed rows that were created before the trigger.
-- Never overwrite PAID or FORFEITED records.
update public.invitations
set
  reward_status = 'ELIGIBLE',
  reward_eligible_at = coalesce(
    reward_eligible_at,
    vote_completed_at,
    updated_at,
    now()
  )
where status = 'COMPLETED'
  and coalesce(reward_status::text, '') not in ('PAID', 'FORFEITED');

commit;
