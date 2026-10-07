revoke insert on table public.reward_boost_reserve_ledger
  from service_role;
revoke usage, select on sequence public.reward_boost_reserve_ledger_id_seq
  from service_role;

create or replace function public.append_reward_boost_reserve_source_sweep(
  p_network text,
  p_app_id text,
  p_source_reward_cohort_round_id bigint,
  p_source_allocation_receipt_id bigint,
  p_amount_wei numeric,
  p_policy_version text,
  p_reference_key text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_row public.reward_boost_reserve_ledger%rowtype;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));
  p_policy_version := btrim(p_policy_version);
  p_reference_key := btrim(p_reference_key);

  if p_amount_wei is null
     or p_amount_wei <= 0
     or p_amount_wei <> trunc(p_amount_wei) then
    raise exception 'INVALID_REWARD_BOOST_RESERVE_AMOUNT';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'INVALID_REWARD_BOOST_RESERVE_DETAILS';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_' || p_network,0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_boost_reserve_' || p_network || '_' || p_app_id,
      0
    )
  );

  select * into v_cfg
  from public.reward_runtime_config
  where id=1
  for update;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;
  if not v_cfg.reward_boost_reserve_enabled then
    raise exception 'REWARD_BOOST_RESERVE_DISABLED';
  end if;
  if v_cfg.emergency_rewards_paused then
    raise exception 'REWARD_BOOST_RESERVE_PAUSED';
  end if;
  if p_network='mainnet' and not v_cfg.mainnet_funded_rewards_enabled then
    raise exception 'REWARD_BOOST_RESERVE_MAINNET_DISABLED';
  end if;

  insert into public.reward_boost_reserve_ledger(
    network,
    app_id,
    entry_kind,
    source_reward_cohort_round_id,
    source_allocation_receipt_id,
    amount_wei,
    policy_version,
    reference_key,
    details
  ) values (
    p_network,
    p_app_id,
    'SOURCE_SWEEP',
    p_source_reward_cohort_round_id,
    p_source_allocation_receipt_id,
    p_amount_wei,
    p_policy_version,
    p_reference_key,
    p_details
  )
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,
    'entryKind',v_row.entry_kind,
    'amountWei',v_row.amount_wei::text,
    'referenceKey',v_row.reference_key,
    'createdAt',v_row.created_at
  );
end;
$$;

revoke all on function public.append_reward_boost_reserve_source_sweep(
  text,text,bigint,bigint,numeric,text,text,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.append_reward_boost_reserve_source_sweep(
  text,text,bigint,bigint,numeric,text,text,jsonb
) to service_role;

create or replace function public.append_reward_boost_reserve_release(
  p_network text,
  p_app_id text,
  p_entry_kind text,
  p_destination_reward_cohort_round_id bigint,
  p_destination_allocation_receipt_id bigint,
  p_amount_wei numeric,
  p_policy_version text,
  p_reference_key text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_kind text := upper(btrim(p_entry_kind));
  v_row public.reward_boost_reserve_ledger%rowtype;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));
  p_policy_version := btrim(p_policy_version);
  p_reference_key := btrim(p_reference_key);

  if v_kind not in ('BOOST_RELEASE','LATE_COMPLETION_RELEASE') then
    raise exception 'INVALID_REWARD_BOOST_RESERVE_RELEASE_KIND';
  end if;
  if p_amount_wei is null
     or p_amount_wei <= 0
     or p_amount_wei <> trunc(p_amount_wei) then
    raise exception 'INVALID_REWARD_BOOST_RESERVE_AMOUNT';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'INVALID_REWARD_BOOST_RESERVE_DETAILS';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_' || p_network,0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_boost_reserve_' || p_network || '_' || p_app_id,
      0
    )
  );

  select * into v_cfg
  from public.reward_runtime_config
  where id=1
  for update;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;
  if not v_cfg.reward_boost_reserve_enabled then
    raise exception 'REWARD_BOOST_RESERVE_DISABLED';
  end if;
  if v_cfg.emergency_rewards_paused then
    raise exception 'REWARD_BOOST_RESERVE_PAUSED';
  end if;
  if p_network='mainnet' and not v_cfg.mainnet_funded_rewards_enabled then
    raise exception 'REWARD_BOOST_RESERVE_MAINNET_DISABLED';
  end if;

  insert into public.reward_boost_reserve_ledger(
    network,
    app_id,
    entry_kind,
    destination_reward_cohort_round_id,
    destination_allocation_receipt_id,
    amount_wei,
    policy_version,
    reference_key,
    details
  ) values (
    p_network,
    p_app_id,
    v_kind,
    p_destination_reward_cohort_round_id,
    p_destination_allocation_receipt_id,
    p_amount_wei,
    p_policy_version,
    p_reference_key,
    p_details
  )
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,
    'entryKind',v_row.entry_kind,
    'amountWei',v_row.amount_wei::text,
    'referenceKey',v_row.reference_key,
    'createdAt',v_row.created_at
  );
end;
$$;

revoke all on function public.append_reward_boost_reserve_release(
  text,text,text,bigint,bigint,numeric,text,text,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.append_reward_boost_reserve_release(
  text,text,text,bigint,bigint,numeric,text,text,jsonb
) to service_role;
