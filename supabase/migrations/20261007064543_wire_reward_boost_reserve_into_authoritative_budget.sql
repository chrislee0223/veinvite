do $body$
declare
  v_def text;
  v_hash text;
  v_target text;
begin
  select pg_get_functiondef(p.oid),md5(pg_get_functiondef(p.oid))
  into v_def,v_hash
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='read_reward_cohort_planning_snapshot'
    and p.prokind='f'
  limit 1;

  if v_hash<>'59dd8d6b5ab70b68ffc5f74343bc2c1b' then
    raise exception 'REWARD_PLANNING_DEFINITION_DRIFT:%',v_hash;
  end if;

  v_target := $t$'fundingAdjustmentWei','0','designatedBudgetWei','0',$t$;
  if position(v_target in v_def)=0 then
    raise exception 'REWARD_PLANNING_EMPTY_SNAPSHOT_PATCH_TARGET_MISSING';
  end if;
  v_def:=replace(
    v_def,
    v_target,
    $t$'fundingAdjustmentWei','0','reserveNetFlowWei','0','designatedBudgetWei','0',$t$
  );

  v_target := 'v_designated := v_receipt.rewards_allocation_amount_wei + v_adjustment;';
  if position(v_target in v_def)=0 then
    raise exception 'REWARD_PLANNING_BUDGET_PATCH_TARGET_MISSING';
  end if;
  v_def:=replace(
    v_def,
    v_target,
    'v_designated := public.read_reward_cohort_effective_budget_wei(p_network,p_app_id,v_cohort_round,v_receipt.id);'
  );

  v_target := $t$'fundingAdjustmentWei',v_adjustment::text,
    'designatedBudgetWei',v_designated::text,$t$;
  if position(v_target in v_def)=0 then
    raise exception 'REWARD_PLANNING_RETURN_PATCH_TARGET_MISSING';
  end if;
  v_def:=replace(
    v_def,
    v_target,
    $t$'fundingAdjustmentWei',v_adjustment::text,
    'reserveNetFlowWei',public.read_reward_boost_reserve_cohort_net_flow_wei(p_network,p_app_id,v_cohort_round,v_receipt.id)::text,
    'designatedBudgetWei',v_designated::text,$t$
  );

  execute v_def;
end
$body$;

do $body$
declare
  v_def text;
  v_hash text;
  v_target text;
begin
  select pg_get_functiondef(p.oid),md5(pg_get_functiondef(p.oid))
  into v_def,v_hash
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='enforce_reward_queue_cohort_budget'
    and p.prokind='f'
  limit 1;

  if v_hash<>'872c02d9e6c403317a0bbe412243bed4' then
    raise exception 'REWARD_QUEUE_BUDGET_DEFINITION_DRIFT:%',v_hash;
  end if;

  v_target := 'v_budget:=v_receipt.rewards_allocation_amount_wei+v_adjustment;';
  if position(v_target in v_def)=0 then
    raise exception 'REWARD_QUEUE_BUDGET_PATCH_TARGET_MISSING';
  end if;
  v_def:=replace(
    v_def,
    v_target,
    'v_budget:=public.read_reward_cohort_effective_budget_wei(v_receipt.network,v_receipt.app_id,v_invitation.reward_cohort_round_id,v_receipt.id);'
  );
  execute v_def;
end
$body$;

do $body$
declare
  v_def text;
  v_hash text;
  v_target text;
begin
  select pg_get_functiondef(p.oid),md5(pg_get_functiondef(p.oid))
  into v_def,v_hash
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='commit_reward_reservation'
    and p.prokind='f'
  limit 1;

  if v_hash<>'abdf28578f7120a8e3610721958fe1df' then
    raise exception 'REWARD_RESERVATION_DEFINITION_DRIFT:%',v_hash;
  end if;

  v_target := 'v_budget:=v_allocation_receipt.rewards_allocation_amount_wei+v_adjustment;';
  if position(v_target in v_def)=0 then
    raise exception 'REWARD_RESERVATION_BUDGET_PATCH_TARGET_MISSING';
  end if;
  v_def:=replace(
    v_def,
    v_target,
    'v_budget:=public.read_reward_cohort_effective_budget_wei(v_network,v_allocation_receipt.app_id,v_invitation.reward_cohort_round_id,v_allocation_receipt.id);'
  );
  execute v_def;
end
$body$;

update public.reward_runtime_config
set reward_boost_reserve_enabled=false
where id=1;
