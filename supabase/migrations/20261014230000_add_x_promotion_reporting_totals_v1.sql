create or replace function public.read_reward_x_promotion_reporting_totals_v1(
  p_network text,
  p_app_id text,
  p_current_allocation_receipt_id bigint
)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_app_id text := lower(btrim(coalesce(p_app_id,'')));
  v_current public.vebetter_round_allocations%rowtype;
  v_cfg public.operator_reporting_config%rowtype;
  v_current_paid numeric(78,0) := 0;
  v_cumulative_paid numeric(78,0) := 0;
  v_prior_paid numeric(78,0) := 0;
  v_unresolved_current bigint := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_X_PROMOTION_REPORTING_NETWORK';
  end if;

  if v_app_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'INVALID_X_PROMOTION_REPORTING_APP_ID';
  end if;

  select * into v_current
  from public.vebetter_round_allocations a
  where a.id=p_current_allocation_receipt_id
    and a.network=v_network
    and a.app_id=v_app_id;

  if not found then
    raise exception 'X_PROMOTION_REPORTING_ALLOCATION_MISMATCH';
  end if;

  select * into v_cfg
  from public.operator_reporting_config c
  where c.id=1;

  if not found
     or v_cfg.reporting_start_at is null
     or v_cfg.reporting_network<>v_network then
    raise exception 'REPORTING_BASELINE_REQUIRED';
  end if;

  select coalesce(sum(r.amount_wei),0)
  into v_current_paid
  from public.reward_x_promotion_receipts r
  where r.network=v_network
    and r.source_allocation_receipt_id=v_current.id;

  select coalesce(sum(r.amount_wei),0)
  into v_cumulative_paid
  from public.reward_x_promotion_receipts r
  join public.vebetter_round_allocations a
    on a.id=r.source_allocation_receipt_id
  where r.network=v_network
    and a.network=v_network
    and a.app_id=v_app_id
    and a.claim_block_timestamp>=v_cfg.reporting_start_at
    and a.vebetter_round_id<=v_current.vebetter_round_id;

  v_prior_paid:=greatest(v_cumulative_paid-v_current_paid,0);

  select count(*)::bigint
  into v_unresolved_current
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
  where s.network=v_network
    and s.mode='LIVE'
    and s.source_allocation_receipt_id=v_current.id
    and o.financial_state in ('RESERVED','HELD');

  return jsonb_build_object(
    'network',v_network,
    'appId',v_app_id,
    'currentAllocationReceiptId',v_current.id,
    'currentVeBetterRoundId',v_current.vebetter_round_id,
    'currentPaidWei',v_current_paid::text,
    'priorPaidWei',v_prior_paid::text,
    'cumulativePaidWei',v_cumulative_paid::text,
    'unresolvedCurrentCount',v_unresolved_current
  );
end;
$function$;

revoke all on function public.read_reward_x_promotion_reporting_totals_v1(text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.read_reward_x_promotion_reporting_totals_v1(text,text,bigint)
  to service_role;
