begin;
-- Aggregate actual Network engagement for verified wallets only.
-- Server supplies an HMAC-SHA256 wallet pseudonym under a dedicated secret.
-- Never store raw wallet addresses, device identifiers or daily visitor keys.
create table if not exists public.app_network_engaged_wallets (
  wallet_key text primary key check (wallet_key ~ '^[0-9a-f]{64}$'),
  first_usage_date date not null,
  last_usage_date date not null,
  active_days integer not null default 1 check (active_days >= 1),
  node_mover boolean not null default false,
  group_editor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_network_wallet_dates_valid check (first_usage_date <= last_usage_date),
  constraint app_network_wallet_action_valid check (node_mover or group_editor)
);
alter table public.app_network_engaged_wallets enable row level security;
revoke all on table public.app_network_engaged_wallets from public, anon, authenticated;
grant select, insert, update on public.app_network_engaged_wallets to service_role;

-- On conflict, several edits in one Seoul date still count as just one day.
-- On a later date, the same wallet becomes one returning wallet.
create or replace function public.record_app_network_wallet_engagement(
  p_wallet_key text,
  p_event_name text
)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_wallet_key is null or p_wallet_key !~ '^[0-9a-f]{64}$' then
    raise exception 'network engagement key is invalid';
  end if;
  if p_event_name not in ('network_node_repositioned','network_group_modified') then
    raise exception 'network engagement event is invalid';
  end if;
  insert into public.app_network_engaged_wallets(
    wallet_key, first_usage_date, last_usage_date, active_days, node_mover, group_editor
  ) values (
    p_wallet_key, v_day, v_day, 1,
    p_event_name = 'network_node_repositioned',
    p_event_name = 'network_group_modified'
  )
  on conflict (wallet_key) do update set
    first_usage_date = least(app_network_engaged_wallets.first_usage_date, excluded.first_usage_date),
    last_usage_date = greatest(app_network_engaged_wallets.last_usage_date, excluded.last_usage_date),
    active_days = app_network_engaged_wallets.active_days + case
      when excluded.last_usage_date > app_network_engaged_wallets.last_usage_date then 1 else 0 end,
    node_mover = app_network_engaged_wallets.node_mover or excluded.node_mover,
    group_editor = app_network_engaged_wallets.group_editor or excluded.group_editor,
    updated_at = now();
end;
$fn$;
revoke all on function public.record_app_network_wallet_engagement(text,text)
  from public, anon, authenticated;
grant execute on function public.record_app_network_wallet_engagement(text,text)
  to service_role;

create or replace function public.read_app_network_lifetime_engagement()
returns table (
  total_verified_wallets bigint,
  returning_wallets bigint,
  node_movers bigint,
  group_editors bigint,
  total_active_days bigint
)
language sql
stable
security invoker
set search_path = public
as $fn$
  select count(*)::bigint,
    count(*) filter (where active_days >= 2)::bigint,
    count(*) filter (where node_mover)::bigint,
    count(*) filter (where group_editor)::bigint,
    coalesce(sum(active_days),0)::bigint
  from public.app_network_engaged_wallets;
$fn$;
revoke all on function public.read_app_network_lifetime_engagement()
  from public, anon, authenticated;
grant execute on function public.read_app_network_lifetime_engagement()
  to service_role;
commit;
