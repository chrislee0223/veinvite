create table if not exists public.wallet_preferences (
  wallet_address text primary key,
  language text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_preferences_wallet_address_check check (
    wallet_address ~ '^0x[0-9a-f]{40}$'
  ),
  constraint wallet_preferences_language_check check (
    language in ('en','ko','zh','hi','es','ja','it','tr','nl','de','fr')
  )
);

alter table public.wallet_preferences enable row level security;

revoke all on table public.wallet_preferences from anon, authenticated;
grant select, insert, update on table public.wallet_preferences to service_role;
