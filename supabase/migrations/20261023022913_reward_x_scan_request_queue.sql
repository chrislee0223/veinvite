-- Additive internal X discovery scheduling checkpoints. No user action is needed.
-- This table does not change B3TR,
-- opportunities, Sybil verdicts, submission eligibility or payout state.
create table public.reward_x_promotion_scan_requests (
  invite_code text primary key
    references public.reward_x_promotion_opportunities(invite_code),
  network text not null check (network in ('mainnet','testnet','testnet-staging')),
  recipient_wallet text not null check (recipient_wallet ~ '^0x[0-9a-f]{40}$'),
  requested_at timestamptz not null default now(),
  last_checked_at timestamptz null
);
create index reward_x_promotion_scan_requests_priority_idx
  on public.reward_x_promotion_scan_requests(network,last_checked_at,requested_at);
alter table public.reward_x_promotion_scan_requests enable row level security;
revoke all on table public.reward_x_promotion_scan_requests from public,anon,authenticated;
grant select,insert,update on table public.reward_x_promotion_scan_requests to service_role;
comment on table public.reward_x_promotion_scan_requests is
  'Server-managed X author scan checkpoints; NEVER Post verification, eligibility or payout proof.';
