begin;

create table if not exists public.sybil_onchain_snapshots (
  id bigint generated always as identity primary key,
  invite_code text not null references public.invitations(invite_code)
    on update cascade on delete restrict,
  wallet_address text not null,
  network text not null,
  activation_block bigint not null,
  first_observed_activity_block bigint,
  age_blocks_at_activation bigint,
  approximate_age_seconds_at_activation bigint,
  first_inbound_vet_block bigint,
  first_inbound_vet_sender text,
  first_inbound_vet_tx_id text,
  first_inbound_vtho_block bigint,
  first_inbound_vtho_sender text,
  first_inbound_vtho_tx_id text,
  vet_funder_referral_count integer not null default 0,
  vtho_funder_referral_count integer not null default 0,
  indicators jsonb not null default '[]'::jsonb,
  observation_only boolean not null default true,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sybil_onchain_snapshots_wallet_check
    check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  constraint sybil_onchain_snapshots_network_check
    check (network in ('mainnet', 'testnet', 'testnet-staging')),
  constraint sybil_onchain_snapshots_activation_block_check
    check (activation_block > 0),
  constraint sybil_onchain_snapshots_first_block_check
    check (
      first_observed_activity_block is null
      or first_observed_activity_block >= 0
    ),
  constraint sybil_onchain_snapshots_age_blocks_check
    check (
      age_blocks_at_activation is null
      or age_blocks_at_activation >= 0
    ),
  constraint sybil_onchain_snapshots_age_seconds_check
    check (
      approximate_age_seconds_at_activation is null
      or approximate_age_seconds_at_activation >= 0
    ),
  constraint sybil_onchain_snapshots_vet_sender_check
    check (
      first_inbound_vet_sender is null
      or first_inbound_vet_sender ~ '^0x[0-9a-f]{40}$'
    ),
  constraint sybil_onchain_snapshots_vtho_sender_check
    check (
      first_inbound_vtho_sender is null
      or first_inbound_vtho_sender ~ '^0x[0-9a-f]{40}$'
    ),
  constraint sybil_onchain_snapshots_indicators_check
    check (jsonb_typeof(indicators) = 'array'),
  constraint sybil_onchain_snapshots_observation_only_check
    check (observation_only is true)
);

create index if not exists sybil_onchain_snapshots_invite_checked_idx
  on public.sybil_onchain_snapshots(invite_code, checked_at desc, id desc);

create index if not exists sybil_onchain_snapshots_vet_funder_idx
  on public.sybil_onchain_snapshots(network, first_inbound_vet_sender)
  where first_inbound_vet_sender is not null;

create index if not exists sybil_onchain_snapshots_vtho_funder_idx
  on public.sybil_onchain_snapshots(network, first_inbound_vtho_sender)
  where first_inbound_vtho_sender is not null;

alter table public.sybil_onchain_snapshots enable row level security;

create or replace function public.prevent_sybil_onchain_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'sybil_onchain_snapshots is append-only';
end;
$$;

drop trigger if exists sybil_onchain_snapshots_append_only
  on public.sybil_onchain_snapshots;

create trigger sybil_onchain_snapshots_append_only
before update or delete on public.sybil_onchain_snapshots
for each row
execute function public.prevent_sybil_onchain_snapshot_mutation();

revoke all on table public.sybil_onchain_snapshots
  from public, anon, authenticated;

grant select, insert on table public.sybil_onchain_snapshots
  to service_role;

grant select, insert on table public.sybil_onchain_snapshots
  to postgres;

revoke all on function public.prevent_sybil_onchain_snapshot_mutation()
  from public, anon, authenticated;

grant execute on function public.prevent_sybil_onchain_snapshot_mutation()
  to service_role, postgres;

commit;
