alter table public.invite_impact_events
  add column if not exists tx_index bigint,
  add column if not exists clause_index bigint;

alter table public.invite_impact_events
  drop constraint if exists invite_impact_events_tx_index_check,
  add constraint invite_impact_events_tx_index_check
    check (tx_index is null or tx_index >= 0),
  drop constraint if exists invite_impact_events_clause_index_check,
  add constraint invite_impact_events_clause_index_check
    check (clause_index is null or clause_index >= 0);
