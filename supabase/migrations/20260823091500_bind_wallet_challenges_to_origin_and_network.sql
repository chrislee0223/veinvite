-- Store the exact signed challenge so verification is bound to the VeInvite
-- origin and network and does not depend on reconstructing mutable text.

begin;

alter table public.wallet_auth_challenges
  add column if not exists message text,
  add column if not exists origin text,
  add column if not exists network text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wallet_auth_challenges_message_check'
  ) then
    alter table public.wallet_auth_challenges
      add constraint wallet_auth_challenges_message_check
      check (
        message is null
        or length(message) between 32 and 4096
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'wallet_auth_challenges_origin_check'
  ) then
    alter table public.wallet_auth_challenges
      add constraint wallet_auth_challenges_origin_check
      check (
        origin is null
        or (
          length(origin) between 8 and 512
          and origin ~ '^https?://'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'wallet_auth_challenges_network_check'
  ) then
    alter table public.wallet_auth_challenges
      add constraint wallet_auth_challenges_network_check
      check (
        network is null
        or network in (
          'mainnet',
          'testnet',
          'testnet-staging'
        )
      );
  end if;
end
$$;

create index if not exists wallet_auth_challenges_active_lookup_idx
  on public.wallet_auth_challenges(
    wallet_address,
    origin,
    network,
    expires_at desc
  )
  where used_at is null;

commit;
