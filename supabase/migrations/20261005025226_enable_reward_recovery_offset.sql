begin;

do $$
declare
  v_enabled boolean;
  v_open_reviews bigint := 0;
  v_settlements bigint := 0;
  v_allocations bigint := 0;
  v_active_queue bigint := 0;
  v_active_obligations bigint := 0;
  v_source_count bigint := 0;
  v_matched_sources bigint := 0;
  v_obligation_total numeric(78,0) := 0;
  v_projected_balance_total numeric(78,0) := 0;
begin
  select reward_recovery_enabled
  into v_enabled
  from public.reward_runtime_config
  where id=1
  for update;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  -- Idempotent if an operator has already activated the exact rollout.
  if v_enabled then
    return;
  end if;

  select count(*)::bigint
  into v_open_reviews
  from public.reward_recovery_review_queue
  where status='OPEN';

  if v_open_reviews<>0 then
    raise exception
      'REWARD_RECOVERY_ACTIVATION_OPEN_REVIEWS count=%',
      v_open_reviews;
  end if;

  select count(*)::bigint
  into v_settlements
  from public.reward_recovery_settlements;

  select count(*)::bigint
  into v_allocations
  from public.reward_recovery_allocations;

  if v_settlements<>0 or v_allocations<>0 then
    raise exception
      'REWARD_RECOVERY_ACTIVATION_NOT_CLEAN settlements=% allocations=%',
      v_settlements,
      v_allocations;
  end if;

  with recovery_wallets as (
    select distinct network,recipient_wallet
    from public.reward_recovery_obligations
    where status='ACTIVE'
  )
  select count(*)::bigint
  into v_active_queue
  from public.reward_queue_entries q
  join recovery_wallets r
    on r.network=q.network
   and r.recipient_wallet=lower(q.recipient_wallet)
  where q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and q.reserved_amount_wei is not null
    and not exists (
      select 1
      from public.reward_payouts p
      where p.invite_code=q.invite_code
        and p.status='PAID'
    );

  if v_active_queue<>0 then
    raise exception
      'REWARD_RECOVERY_ACTIVATION_ACTIVE_QUEUE count=%',
      v_active_queue;
  end if;

  select
    count(*)::bigint,
    coalesce(sum(o.amount_wei),0)::numeric
  into
    v_active_obligations,
    v_obligation_total
  from public.reward_recovery_obligations o
  where o.status='ACTIVE';

  select count(*)::bigint
  into v_source_count
  from public.sybil_v2_referral_invalidations x
  join public.reward_receipts r
    on r.invite_code=x.invite_code
   and lower(r.network)=lower(x.network)
  where x.status='ACTIVE'
    and r.amount_wei>0;

  select count(*)::bigint
  into v_matched_sources
  from public.sybil_v2_referral_invalidations x
  join public.reward_receipts r
    on r.invite_code=x.invite_code
   and lower(r.network)=lower(x.network)
  join public.reward_recovery_obligations o
    on o.source_invalidation_id=x.id
   and o.source_receipt_id=r.id
   and o.status='ACTIVE'
   and o.network=lower(r.network)
   and o.recipient_wallet=lower(r.recipient_wallet)
   and o.source_invite_code=r.invite_code
   and o.amount_wei=r.amount_wei
  where x.status='ACTIVE'
    and r.amount_wei>0;

  if v_active_obligations<>v_source_count
     or v_matched_sources<>v_source_count then
    raise exception
      'REWARD_RECOVERY_ACTIVATION_SOURCE_DRIFT obligations=% sources=% matched=%',
      v_active_obligations,
      v_source_count,
      v_matched_sources;
  end if;

  select coalesce(sum(
    public.read_reward_recovery_balance_wei(
      wallets.network,
      wallets.recipient_wallet
    )
  ),0)::numeric
  into v_projected_balance_total
  from (
    select distinct network,recipient_wallet
    from public.reward_recovery_obligations
    where status='ACTIVE'
  ) wallets;

  if v_projected_balance_total<>v_obligation_total then
    raise exception
      'REWARD_RECOVERY_ACTIVATION_BALANCE_DRIFT obligations=% projected=%',
      v_obligation_total,
      v_projected_balance_total;
  end if;

  update public.reward_runtime_config
  set reward_recovery_enabled=true
  where id=1
    and reward_recovery_enabled=false;

  if not found then
    raise exception 'REWARD_RECOVERY_ACTIVATION_UPDATE_FAILED';
  end if;

  if not exists (
    select 1
    from public.reward_runtime_config
    where id=1
      and reward_recovery_enabled=true
  ) then
    raise exception 'REWARD_RECOVERY_ACTIVATION_VERIFY_FAILED';
  end if;
end;
$$;

commit;
