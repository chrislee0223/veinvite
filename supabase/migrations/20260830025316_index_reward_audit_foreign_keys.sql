begin;

create index reward_payout_status_events_invite_idx
  on public.reward_payout_status_events(invite_code, recorded_at);

create index reward_round_status_events_epoch_idx
  on public.reward_round_status_events(reward_budget_epoch_id, recorded_at)
  where reward_budget_epoch_id is not null;

create index reward_runtime_config_events_config_idx
  on public.reward_runtime_config_events(config_id, recorded_at);

commit;
