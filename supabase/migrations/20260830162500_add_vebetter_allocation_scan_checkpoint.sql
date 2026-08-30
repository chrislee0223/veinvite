-- Keep public reward-estimate allocation sync incremental. The checkpoint only
-- records the latest successfully scanned VeChain block; it cannot create or
-- modify reward allocations, reward rounds, manifests, or payouts.

begin;

create table if not exists public.vebetter_allocation_scan_checkpoints (
  network text primary key,
  last_scanned_block bigint not null,
  updated_at timestamptz not null default now(),
  constraint vebetter_allocation_scan_checkpoint_network_check
    check (network in ('mainnet', 'testnet', 'testnet-staging')),
  constraint vebetter_allocation_scan_checkpoint_block_check
    check (last_scanned_block >= 0)
);

alter table public.vebetter_allocation_scan_checkpoints enable row level security;

revoke all on table public.vebetter_allocation_scan_checkpoints
  from public, anon, authenticated;
grant select, insert, update on table public.vebetter_allocation_scan_checkpoints
  to service_role;

comment on table public.vebetter_allocation_scan_checkpoints is
  'Server-only cursor for incremental VeBetter AllocationRewardsClaimed scans. It contains no reward entitlement or payout state.';

commit;
