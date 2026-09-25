-- Keep the Pro vote watcher incremental without granting it any reward or
-- Sybil authority. This checkpoint only records the latest finalized VeChain
-- block whose AllocationVoteCast events were successfully handled.

begin;

create table if not exists public.vote_reconcile_scan_checkpoints (
  network text primary key,
  last_scanned_block bigint not null,
  updated_at timestamptz not null default now(),
  constraint vote_reconcile_scan_checkpoint_network_check
    check (network in ('mainnet', 'testnet', 'testnet-staging')),
  constraint vote_reconcile_scan_checkpoint_block_check
    check (last_scanned_block >= 0)
);

alter table public.vote_reconcile_scan_checkpoints enable row level security;

revoke all on table public.vote_reconcile_scan_checkpoints
  from public, anon, authenticated, service_role;

grant select, insert, update
on table public.vote_reconcile_scan_checkpoints
to service_role;

comment on table public.vote_reconcile_scan_checkpoints is
  'Server-only cursor for incremental finalized AllocationVoteCast scans used by the Pro vote reconciliation watcher. It contains no reward entitlement, Sybil verdict, or payout authority.';

commit;
