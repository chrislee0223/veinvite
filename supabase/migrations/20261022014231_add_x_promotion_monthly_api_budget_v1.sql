-- Shared atomic pessimistic monthly X API read-cost allowance.
-- Costs expressed in integer millicents of USD ($0.001); 5,000 = $5.
-- Fixed DB limits prevent accidentally broadening the user's approved budget
-- merely by changing a Vercel runtime variable.
create table if not exists public.reward_x_promotion_api_budget_months (
  month_utc date primary key,
  reserved_milliusd integer not null default 0 check (reserved_milliusd between 0 and 5000),
  timeline_reserved_milliusd integer not null default 0 check (timeline_reserved_milliusd between 0 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.reward_x_promotion_api_budget_reservations (
  month_utc date not null references public.reward_x_promotion_api_budget_months(month_utc),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  cost_milliusd integer not null check (cost_milliusd in (10,15,60)),
  request_kind text not null check (request_kind in ('TIMELINE','POST_LOOKUP','OAUTH_USER')),
  created_at timestamptz not null default now(),
  primary key (month_utc,request_hash)
);
alter table public.reward_x_promotion_api_budget_months enable row level security;
alter table public.reward_x_promotion_api_budget_reservations enable row level security;
revoke all on table public.reward_x_promotion_api_budget_months from public,anon,authenticated;
revoke all on table public.reward_x_promotion_api_budget_reservations from public,anon,authenticated;
grant select on table public.reward_x_promotion_api_budget_months to service_role;
grant select on table public.reward_x_promotion_api_budget_reservations to service_role;

create or replace function public.reserve_reward_x_promotion_api_budget_v1(
  p_request_hash text,
  p_cost_milliusd integer,
  p_request_kind text
) returns boolean
language plpgsql security definer set search_path = public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_month date := date_trunc('month', clock_timestamp() at time zone 'UTC')::date;
  v_budget public.reward_x_promotion_api_budget_months%rowtype;
  v_expected_cost integer;
begin
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid X budget request hash';
  end if;
  v_expected_cost := case p_request_kind
    when 'TIMELINE' then 60   -- <= 10 Posts + optional author expansion
    when 'POST_LOOKUP' then 15 -- <= 1 Post + optional author expansion
    when 'OAUTH_USER' then 10 -- <= 1 X user
    else null
  end;
  if v_expected_cost is null or p_cost_milliusd is distinct from v_expected_cost then
    raise exception 'invalid X budget request type or cost';
  end if;

  insert into public.reward_x_promotion_api_budget_months (month_utc)
  values (v_month) on conflict (month_utc) do nothing;

  select * into strict v_budget
  from public.reward_x_promotion_api_budget_months
  where month_utc = v_month for update;

  -- Idempotency is restricted to the same UTC month AND explicit request hash.
  -- Callers use independent hashes per billable attempt; no raw X ID is stored.
  if exists (
    select 1 from public.reward_x_promotion_api_budget_reservations
    where month_utc = v_month and request_hash = p_request_hash
  ) then return true; end if;

  if v_budget.reserved_milliusd + v_expected_cost > 5000 or
    (p_request_kind = 'TIMELINE' and
      v_budget.timeline_reserved_milliusd + v_expected_cost > 3000) then
    return false;
  end if;

  insert into public.reward_x_promotion_api_budget_reservations
    (month_utc,request_hash,cost_milliusd,request_kind)
  values (v_month,p_request_hash,v_expected_cost,p_request_kind);

  update public.reward_x_promotion_api_budget_months set
    reserved_milliusd = reserved_milliusd + v_expected_cost,
    timeline_reserved_milliusd = timeline_reserved_milliusd +
      case when p_request_kind='TIMELINE' then v_expected_cost else 0 end,
    updated_at = v_now where month_utc = v_month;
  return true;
end;
$function$;
revoke all on function public.reserve_reward_x_promotion_api_budget_v1(text,integer,text) from public,anon,authenticated;
grant execute on function public.reserve_reward_x_promotion_api_budget_v1(text,integer,text) to service_role;
comment on function public.reserve_reward_x_promotion_api_budget_v1(text,integer,text)
is 'Atomic pessimistic $5 UTC-calendar-month ceiling for VeInvite X read budget. Does not replace X Developer Console provider spending limit.';
