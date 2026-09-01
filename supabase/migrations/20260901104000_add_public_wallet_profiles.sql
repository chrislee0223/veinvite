begin;

create table if not exists public.public_wallet_profiles (
  wallet_address text primary key,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_wallet_profiles_wallet_shape check (
    wallet_address = lower(btrim(wallet_address))
    and wallet_address ~ '^0x[0-9a-f]{40}$'
  ),
  constraint public_wallet_profiles_display_name_shape check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 32
    )
  ),
  constraint public_wallet_profiles_avatar_path_shape check (
    avatar_path is null
    or avatar_path ~ '^0x[0-9a-f]{40}/[0-9]{13}-[0-9a-f-]{36}\\.(png|jpg|webp)$'
  )
);

alter table public.public_wallet_profiles enable row level security;
revoke all on table public.public_wallet_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.public_wallet_profiles to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'profile-avatars',
  'profile-avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.public_wallet_profiles is
  'Optional public VeInvite profile metadata keyed by wallet. It is display-only and never affects referral eligibility, ranking calculations, Sybil decisions, or rewards.';

comment on column public.public_wallet_profiles.display_name is
  'Optional user-selected public display name. Wallet address remains the authoritative identity.';

comment on column public.public_wallet_profiles.avatar_path is
  'Optional server-managed object path in the public profile-avatars storage bucket.';

commit;
