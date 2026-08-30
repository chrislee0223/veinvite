create or replace function public.sync_invitation_reward_eligibility()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Paid records are historical settlement records and must not be reopened.
  if coalesce(new.reward_status::text, '') = 'PAID' then
    return new;
  end if;

  -- A cancelled invitation can never become reward eligible.
  if new.status = 'CANCELLED' then
    new.reward_status := 'FORFEITED';
    new.reward_eligible_at := null;
    return new;
  end if;

  -- App-completion checkpoints and vote evidence are only valid after
  -- three distinct app rewards have been observed on the configured chain.
  if coalesce(new.apps_completed, 0) < 3 then
    new.apps_completed_at := null;
    new.apps_completed_block := null;
    new.vote_completed := false;
    new.vote_completed_at := null;
    new.vote_completed_block := null;
    new.vote_round_id := null;
  end if;

  if new.status = 'COMPLETED' then
    if new.invitee_wallet is not null
       and new.activation_block is not null
       and coalesce(new.apps_completed, 0) >= 3
       and new.apps_completed_block is not null
       and coalesce(new.vote_completed, false) = true
       and new.vote_completed_block is not null then
      new.reward_status := 'ELIGIBLE';
      new.reward_eligible_at := coalesce(new.reward_eligible_at, new.vote_completed_at, now());
    else
      new.reward_status := 'PENDING';
      new.reward_eligible_at := null;
    end if;
  elsif new.invitee_wallet is not null then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  else
    new.reward_status := 'NONE';
    new.reward_eligible_at := null;
  end if;

  return new;
end;
$$;

update public.invitations
set updated_at = updated_at
where coalesce(reward_status::text, '') <> 'PAID';