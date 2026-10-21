-- OAuth attestation is distinct from legacy Post-URL identity binding.
-- A manually submitted, publicly copyable Post link is NOT account-ownership proof.
-- Apply only as part of the reviewed X OAuth rollout; the feature remains off by default.
create table if not exists public.reward_x_promotion_oauth_proofs (
  network text not null check (network in ('mainnet','testnet','testnet-staging')),
  recipient_wallet text not null check (recipient_wallet ~ '^0x[0-9a-f]{40}$'),
  x_author_id text not null check (x_author_id ~ '^[0-9]{1,32}$'),
  verified_at timestamptz not null default clock_timestamp(),
  proof_method text not null default 'OAUTH2_PKCE'
    check (proof_method = 'OAUTH2_PKCE'),
  primary key (network, recipient_wallet),
  unique (network, x_author_id),
  foreign key (network, recipient_wallet)
    references public.reward_x_promotion_x_identities(network, recipient_wallet)
);

-- On every INSERT, require the immutable legacy identity to agree on BOTH
-- author and wallet; two independent unique keys alone cannot prove that.
create or replace function public.guard_reward_x_promotion_oauth_proof_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if tg_op <> 'INSERT' then
    raise exception 'REWARD_X_OAUTH_PROOF_IMMUTABLE';
  end if;
  if not exists (
    select 1
    from public.reward_x_promotion_x_identities i
    where i.network = new.network
      and i.recipient_wallet = new.recipient_wallet
      and i.x_author_id = new.x_author_id
  ) then
    raise exception 'REWARD_X_OAUTH_IDENTITY_MISMATCH';
  end if;
  return new;
end;
$function$;

drop trigger if exists reward_x_promotion_oauth_proof_guard
  on public.reward_x_promotion_oauth_proofs;
create trigger reward_x_promotion_oauth_proof_guard
before insert or update or delete
on public.reward_x_promotion_oauth_proofs
for each row execute function public.guard_reward_x_promotion_oauth_proof_v1();

alter table public.reward_x_promotion_oauth_proofs enable row level security;
revoke all on public.reward_x_promotion_oauth_proofs from public, anon, authenticated;
grant select, insert on public.reward_x_promotion_oauth_proofs to service_role;
revoke all on function public.guard_reward_x_promotion_oauth_proof_v1()
from public, anon, authenticated;
