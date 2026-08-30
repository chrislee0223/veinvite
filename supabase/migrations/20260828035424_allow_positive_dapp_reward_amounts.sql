begin;

-- Compatibility step for rolling out positive B3TR amount provenance on
-- DAPP_REWARD impact rows. Existing code may still write NULL during a short
-- deployment window; the follow-up strict migration removes that allowance
-- after the new code is live and the table has been checked.
alter table public.invite_impact_events
  drop constraint if exists invite_impact_events_shape_check;

alter table public.invite_impact_events
  add constraint invite_impact_events_shape_check
  check (
    (
      event_type = 'DAPP_REWARD'
      and app_id is not null
      and vote_round_id is null
      and (
        amount_wei is null
        or (
          amount_wei ~ '^[0-9]+$'
          and amount_wei::numeric > 0
        )
      )
    )
    or (
      event_type = 'VOT3_CONVERSION'
      and app_id is null
      and vote_round_id is null
      and amount_wei is not null
      and amount_wei ~ '^[0-9]+$'
      and amount_wei::numeric > 0
    )
    or (
      event_type = 'ALLOCATION_VOTE'
      and app_id is null
      and vote_round_id is not null
      and amount_wei is null
    )
  );

-- These are trigger functions, not client RPCs. Keep their direct EXECUTE
-- surface closed when the function exists in the target environment.
do $$
begin
  if to_regprocedure('public.set_reward_payout_updated_at()') is not null then
    execute 'revoke execute on function public.set_reward_payout_updated_at() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.sync_invitation_reward_eligibility()') is not null then
    execute 'revoke execute on function public.sync_invitation_reward_eligibility() from public, anon, authenticated';
  end if;
end
$$;

commit;
