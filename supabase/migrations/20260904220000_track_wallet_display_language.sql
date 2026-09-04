-- Track the language a connected wallet is actually seeing without turning
-- browser auto-detection into a persistent cross-device preference.
--
-- wallet_preferences remains the explicit/stored preference. This table is
-- operational analytics: the latest observed display language and how it was
-- resolved for the authenticated wallet.

create table if not exists public.wallet_language_usage (
  wallet_address text primary key,
  current_language text not null,
  current_source text not null,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_language_usage_wallet_address_check check (
    wallet_address ~ '^0x[0-9a-f]{40}$'
  ),
  constraint wallet_language_usage_language_check check (
    char_length(current_language) <= 35
    and current_language ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'
  ),
  constraint wallet_language_usage_source_check check (
    current_source in (
      'browser_auto',
      'local_storage',
      'wallet_preference',
      'manual_selection'
    )
  )
);

create index if not exists wallet_language_usage_current_language_idx
  on public.wallet_language_usage (current_language);

create index if not exists wallet_language_usage_last_observed_at_idx
  on public.wallet_language_usage (last_observed_at desc);

alter table public.wallet_language_usage enable row level security;

revoke all on table public.wallet_language_usage from anon, authenticated;
grant select, insert, update on table public.wallet_language_usage to service_role;

-- Existing explicit preferences are safe to seed because they are already the
-- authoritative language for those wallets. Wallets with no explicit
-- preference are intentionally left unknown until their next authenticated
-- VeInvite session, when the client can report the language actually shown.
insert into public.wallet_language_usage (
  wallet_address,
  current_language,
  current_source,
  first_observed_at,
  last_observed_at,
  updated_at
)
select
  wallet_address,
  language,
  'wallet_preference',
  created_at,
  updated_at,
  updated_at
from public.wallet_preferences
on conflict (wallet_address) do nothing;
