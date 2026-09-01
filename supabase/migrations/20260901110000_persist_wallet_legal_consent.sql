create table if not exists public.wallet_legal_consents (
  wallet_address text not null,
  terms_version integer not null,
  privacy_version integer not null,
  accepted_at timestamptz not null default now(),
  acceptance_source text not null default 'ui',
  constraint wallet_legal_consents_pkey primary key (wallet_address, terms_version, privacy_version),
  constraint wallet_legal_consents_wallet_lowercase check (wallet_address = lower(wallet_address)),
  constraint wallet_legal_consents_wallet_format check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  constraint wallet_legal_consents_terms_version_positive check (terms_version > 0),
  constraint wallet_legal_consents_privacy_version_positive check (privacy_version > 0),
  constraint wallet_legal_consents_source_check check (
    acceptance_source in ('ui', 'legacy-local-storage')
  )
);

create index if not exists wallet_legal_consents_accepted_at_idx
  on public.wallet_legal_consents (accepted_at desc);

alter table public.wallet_legal_consents enable row level security;

revoke all on table public.wallet_legal_consents from anon, authenticated;
grant select, insert on table public.wallet_legal_consents to service_role;

comment on table public.wallet_legal_consents is
  'Server-side record of VeInvite legal document acceptance by wallet and document versions.';
