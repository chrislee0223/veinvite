begin;

-- Finalize the positive-B3TR evidence rollout after the application version
-- that persists DAPP_REWARD amounts is live. From this point onward every
-- qualifying dApp reward impact row must carry a strictly positive amount.
alter table public.invite_impact_events
  drop constraint if exists invite_impact_events_shape_check;

alter table public.invite_impact_events
  add constraint invite_impact_events_shape_check
  check (
    (
      event_type = 'DAPP_REWARD'
      and app_id is not null
      and vote_round_id is null
      and amount_wei is not null
      and amount_wei ~ '^[0-9]+'
      and amount_wei::numeric > 0
    )
    or (
      event_type = 'VOT3_CONVERSION'
      and app_id is null
      and vote_round_id is null
      and amount_wei is not null
      and amount_wei ~ '^[0-9]+'
      and amount_wei::numeric > 0
    )
    or (
      event_type = 'ALLOCATION_VOTE'
      and app_id is null
      and vote_round_id is not null
      and amount_wei is null
    )
  );

commit;
