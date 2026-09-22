begin;

alter table public.sybil_v2_scan_checkpoints
  add column if not exists analyzer_version text not null default 'sybil-v2.0';

create index if not exists sybil_v2_scan_checkpoints_analyzer_status_idx
  on public.sybil_v2_scan_checkpoints(
    network, analyzer_version, historical_chain_status, funding_chain_status, updated_at
  );

comment on column public.sybil_v2_scan_checkpoints.analyzer_version is
  'Analyzer version that produced the COMPLETE/FAILED checkpoint. A newer analyzer must rescan instead of trusting stale COMPLETE evidence.';

commit;
