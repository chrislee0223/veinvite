-- Store the latest read-only VeBetterPassport bot-signal observation per invite.
-- This table is telemetry only: it does not grant reward eligibility, block a
-- wallet, or write any signal back to VeBetterPassport.

begin;

create table public.sybil_signal_observations (
  invite_code text primary key
    references public.invitations(invite_code)
    on update cascade
    on delete restrict,
  wallet_address text not null,
  network text not null,
  available boolean not null default false,
  signal_count integer,
  checked_at timestamptz not null,
  source text not null default 'VEBETTER_PASSPORT',
  last_error text,
  updated_at timestamptz not null default now(),
  constraint sybil_signal_observations_wallet_check
    check (wallet_address ~ '^0x[0-9a-f]{40}$'::text),
  constraint sybil_signal_observations_network_check
    check (network = any (array['mainnet'::text, 'testnet'::text, 'testnet-staging'::text])),
  constraint sybil_signal_observations_signal_count_check
    check (signal_count is null or signal_count >= 0),
  constraint sybil_signal_observations_source_check
    check (source = 'VEBETTER_PASSPORT'),
  constraint sybil_signal_observations_availability_check
    check (
      (available = true and signal_count is not null and last_error is null)
      or
      (available = false and signal_count is null)
    )
);

create index sybil_signal_observations_wallet_checked_idx
  on public.sybil_signal_observations (wallet_address, checked_at desc);
create index sybil_signal_observations_signal_checked_idx
  on public.sybil_signal_observations (signal_count desc, checked_at desc)
  where signal_count is not null;

alter table public.sybil_signal_observations enable row level security;
revoke all on table public.sybil_signal_observations
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.sybil_signal_observations
  to service_role;

commit;
