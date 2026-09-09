alter table public.network_runtime_config
  alter column enabled set default false;

create table if not exists public.network_public_profile_events (
  id bigint generated always as identity primary key,
  wallet_address text not null,
  previous_public_enabled boolean,
  public_enabled boolean not null,
  previous_discoverable boolean,
  discoverable boolean not null,
  changed_at timestamptz not null default now()
);

create index if not exists network_public_profile_events_wallet_changed_idx
  on public.network_public_profile_events (wallet_address, changed_at desc);

alter table public.network_public_profile_events enable row level security;
revoke all on table public.network_public_profile_events from public, anon, authenticated, service_role;
grant select on table public.network_public_profile_events to service_role;

create table if not exists public.network_runtime_config_events (
  id bigint generated always as identity primary key,
  previous_enabled boolean,
  next_enabled boolean not null,
  previous_my_mode text,
  next_my_mode text not null,
  previous_public_mode text,
  next_public_mode text not null,
  note text,
  changed_at timestamptz not null default now()
);

alter table public.network_runtime_config_events enable row level security;
revoke all on table public.network_runtime_config_events from public, anon, authenticated, service_role;
grant select on table public.network_runtime_config_events to service_role;

create or replace function public.audit_network_public_profile_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.network_public_profile_events (
      wallet_address,
      previous_public_enabled,
      public_enabled,
      previous_discoverable,
      discoverable,
      changed_at
    ) values (
      new.wallet_address,
      null,
      new.public_enabled,
      null,
      new.discoverable,
      now()
    );
  elsif old.public_enabled is distinct from new.public_enabled
     or old.discoverable is distinct from new.discoverable then
    insert into public.network_public_profile_events (
      wallet_address,
      previous_public_enabled,
      public_enabled,
      previous_discoverable,
      discoverable,
      changed_at
    ) values (
      new.wallet_address,
      old.public_enabled,
      new.public_enabled,
      old.discoverable,
      new.discoverable,
      now()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_network_public_profile_change()
  from public, anon, authenticated, service_role;

drop trigger if exists audit_network_public_profile_change_trigger
  on public.network_public_profiles;
create trigger audit_network_public_profile_change_trigger
after insert or update on public.network_public_profiles
for each row execute function public.audit_network_public_profile_change();

create or replace function public.audit_network_runtime_config_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and (
    old.enabled is distinct from new.enabled
    or old.my_mode is distinct from new.my_mode
    or old.public_mode is distinct from new.public_mode
    or old.note is distinct from new.note
  ) then
    insert into public.network_runtime_config_events (
      previous_enabled,
      next_enabled,
      previous_my_mode,
      next_my_mode,
      previous_public_mode,
      next_public_mode,
      note,
      changed_at
    ) values (
      old.enabled,
      new.enabled,
      old.my_mode,
      new.my_mode,
      old.public_mode,
      new.public_mode,
      new.note,
      now()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_network_runtime_config_change()
  from public, anon, authenticated, service_role;

drop trigger if exists audit_network_runtime_config_change_trigger
  on public.network_runtime_config;
create trigger audit_network_runtime_config_change_trigger
after update on public.network_runtime_config
for each row execute function public.audit_network_runtime_config_change();

comment on table public.network_public_profile_events is
  'Append-only audit trail for wallet Public Network visibility and discoverability changes.';
comment on table public.network_runtime_config_events is
  'Append-only audit trail for My/Public Network rollout mode changes.';
