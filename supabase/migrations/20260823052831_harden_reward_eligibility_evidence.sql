-- VeInvite automatic rewards - harden eligibility evidence
-- A COMPLETED status alone is not enough to earn a payout.
-- The invitation must also contain the on-chain mission checkpoints.

begin;

create or replace function public.sync_invitation_reward_eligibility()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Never rewrite terminal reward states.
  if coalesce(new.reward_status::text, '') in ('PAID', 'FORFEITED') then
    return new;
  end if;

  if new.status = 'COMPLETED' then
    if new.invitee_wallet is not null
       and new.activation_block is not null
       and coalesce(new.apps_completed, 0) >= 3
       and new.apps_completed_block is not null
       and coalesce(new.vote_completed, false) = true
       and new.vote_completed_block is not null then
      new.reward_status := 'ELIGIBLE';
      new.reward_eligible_at := coalesce(
        new.reward_eligible_at,
        new.vote_completed_at,
        now()
      );
    else
      -- Legacy/demo/incomplete rows must never be paid automatically.
      new.reward_status := 'PENDING';
      new.reward_eligible_at := null;
    end if;
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

-- Repair existing completed rows according to the stricter evidence rule.
update public.invitations
set
  reward_status = case
    when invitee_wallet is not null
      and activation_block is not null
      and coalesce(apps_completed, 0) >= 3
      and apps_completed_block is not null
      and coalesce(vote_completed, false) = true
      and vote_completed_block is not null
    then 'ELIGIBLE'
    else 'PENDING'
  end,
  reward_eligible_at = case
    when invitee_wallet is not null
      and activation_block is not null
      and coalesce(apps_completed, 0) >= 3
      and apps_completed_block is not null
      and coalesce(vote_completed, false) = true
      and vote_completed_block is not null
    then coalesce(reward_eligible_at, vote_completed_at, now())
    else null
  end
where status = 'COMPLETED'
  and coalesce(reward_status::text, '') not in ('PAID', 'FORFEITED');

commit;
