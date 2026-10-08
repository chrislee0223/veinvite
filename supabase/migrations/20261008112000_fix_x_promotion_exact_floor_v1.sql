create or replace function public.calculate_reward_x_promotion_split_v1(
  p_reservation_amount_wei numeric
)
returns table(
  base_amount_wei numeric,
  promotion_amount_wei numeric,
  promotion_rate_bps integer,
  promotion_cap_wei numeric
)
language plpgsql
immutable
strict
set search_path to 'pg_catalog','public'
as $function$
declare
  v_rate_bps constant integer := 1000;
  v_cap_wei constant numeric(78,0) := 10000000000000000000;
  v_reservation numeric(78,0);
  v_promotion numeric(78,0);
begin
  if p_reservation_amount_wei <= 0
     or p_reservation_amount_wei <> trunc(p_reservation_amount_wei) then
    raise exception 'REWARD_X_PROMOTION_INVALID_RESERVATION';
  end if;

  v_reservation := p_reservation_amount_wei::numeric(78,0);

  -- numeric(78,0) division rounds to scale 0 before truncation. Use div()
  -- so the percentage component is always the exact integer floor in wei.
  v_promotion := least(
    v_cap_wei,
    div(v_reservation * v_rate_bps::numeric, 10000::numeric),
    greatest(v_reservation - 1, 0)
  );

  return query
  select
    (v_reservation - v_promotion)::numeric,
    v_promotion::numeric,
    v_rate_bps,
    v_cap_wei::numeric;
end;
$function$;

revoke all on function public.calculate_reward_x_promotion_split_v1(numeric)
  from public,anon,authenticated;
grant execute on function public.calculate_reward_x_promotion_split_v1(numeric)
  to service_role;

do $$
begin
  if exists (
    select 1
    from public.reward_x_promotion_splits s
    cross join lateral public.calculate_reward_x_promotion_split_v1(
      s.reservation_amount_wei
    ) c
    where s.policy_version='x-promotion-split-v1'
      and (
        s.base_amount_wei<>c.base_amount_wei
        or s.promotion_amount_wei<>c.promotion_amount_wei
        or s.promotion_rate_bps<>c.promotion_rate_bps
        or s.promotion_cap_wei<>c.promotion_cap_wei
      )
  ) then
    raise exception 'REWARD_X_PROMOTION_EXISTING_SPLIT_RECALC_REQUIRED';
  end if;
end $$;

comment on function public.calculate_reward_x_promotion_split_v1(numeric) is
  'Deterministic v1 X promotion split: promo=min(10 B3TR, exact floor(10% of fixed net reservation)), with at least 1 wei left in base.';
