alter table public.network_runtime_config
  add column if not exists public_layout_mode text not null default 'off';

alter table public.network_runtime_config
  drop constraint if exists network_runtime_config_public_layout_mode_check;

alter table public.network_runtime_config
  add constraint network_runtime_config_public_layout_mode_check
  check (public_layout_mode in ('off','canary','on'));

create table if not exists public.network_public_layouts (
  root_wallet text not null,
  focus_wallet text not null,
  revision bigint not null default 1,
  schema_version smallint not null default 1,
  workspace jsonb not null default '{"positions":{},"groups":[]}'::jsonb,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (root_wallet, focus_wallet),
  constraint network_public_layouts_root_wallet_format
    check (root_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint network_public_layouts_focus_wallet_format
    check (focus_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint network_public_layouts_revision_positive
    check (revision > 0),
  constraint network_public_layouts_schema_version_supported
    check (schema_version = 1),
  constraint network_public_layouts_workspace_object
    check (jsonb_typeof(workspace) = 'object')
);

create index if not exists network_public_layouts_updated_at_idx
  on public.network_public_layouts(updated_at desc);

alter table public.network_public_layouts enable row level security;

revoke all on public.network_public_layouts
  from public, anon, authenticated;

grant select, insert, update, delete
  on public.network_public_layouts
  to service_role;

comment on table public.network_public_layouts is
  'Server-owned published Network layout snapshots. Browser clients access these only through validated VeInvite API routes.';
