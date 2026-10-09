-- Keep one authoritative transfer-amount reader for both batch construction
-- and the payout INSERT fail-closed trigger. LIVE activation remains blocked.
create or replace function public.read_reward_batch_transfer_amount_wei_v1(
  p_invite_code text
)
returns numeric
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_cfg public.reward_runtime_config%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code=v_code;

  if not found
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<=0
     or v_queue.reserved_at is null then
    raise exception 'REWARD_BATCH_RESERVATION_MISSING';
  end if;

  -- An already-created LIVE split is an immutable promise. It remains
  -- authoritative even if new X-promotion offers are later disabled or a
  -- newer policy version becomes current.
  select * into v_split
  from public.reward_x_promotion_splits s
  where s.invite_code=v_code
    and s.mode='LIVE';

  if found then
    if v_split.queue_entry_id<>v_queue.id
       or v_split.network<>v_queue.network
       or v_split.recipient_wallet<>lower(v_queue.recipient_wallet)
       or v_split.reservation_amount_wei<>v_queue.reserved_amount_wei
       or v_split.policy_version<>'x-promotion-split-v1'
       or v_split.base_amount_wei<=0
       or v_split.base_amount_wei+v_split.promotion_amount_wei<>v_queue.reserved_amount_wei then
      raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISMATCH';
    end if;

    if v_split.promotion_amount_wei>0 then
      select * into v_obligation
      from public.reward_x_promotion_obligations o
      where o.split_id=v_split.id
        and o.invite_code=v_code;

      if not found
         or v_obligation.network<>v_split.network
         or v_obligation.recipient_wallet<>v_split.recipient_wallet
         or v_obligation.promotion_amount_wei<>v_split.promotion_amount_wei
         or v_obligation.policy_version<>v_split.policy_version
         or v_obligation.financial_state<>'RESERVED' then
        raise exception 'REWARD_X_PROMOTION_OBLIGATION_NOT_RESERVED';
      end if;
    end if;

    return v_split.base_amount_wei;
  end if;

  -- No LIVE split means this is legacy/grandfathered unless the runtime says
  -- it belongs to the active LIVE window. Never silently fall back inside an
  -- active LIVE window.
  if not v_cfg.reward_x_promotion_enabled then
    return v_queue.reserved_amount_wei;
  end if;

  if v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_LIVE_START_MISSING';
  end if;

  if v_queue.reserved_at<v_cfg.reward_x_promotion_live_started_at then
    return v_queue.reserved_amount_wei;
  end if;

  raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISSING';
end;
$function$;

revoke all on function public.read_reward_batch_transfer_amount_wei_v1(text)
  from public,anon,authenticated;
grant execute on function public.read_reward_batch_transfer_amount_wei_v1(text)
  to service_role;


CREATE OR REPLACE FUNCTION public.prepare_reward_cohort_batch(p_network text, p_app_id text, p_pool_balance_wei numeric, p_allocation_receipt_id bigint, p_expected_completions integer, p_stress_completions integer, p_reward_per_invite_wei numeric, p_algorithm_version text, p_pipeline_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_batch_limit constant integer := 25;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_epoch public.reward_budget_epochs%rowtype;
  v_reserved_existing numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
  v_candidate_codes text[] := array[]::text[];
  v_eligible_count integer := 0;
  v_round_id bigint;
  v_distributable numeric(78,0) := 0;
  v_remainder numeric(78,0) := 0;
  v_payout_count integer := 0;
  v_assigned_count integer := 0;
  v_epoch_created boolean := false;
  v_now timestamptz := now();
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));
  p_algorithm_version := btrim(p_algorithm_version);

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_app_id <> v_veinvite_app_id then
    raise exception 'cohort rewards can only target the VeInvite app';
  end if;
  if p_pool_balance_wei is null or p_pool_balance_wei < 0
     or p_pool_balance_wei <> trunc(p_pool_balance_wei) then
    raise exception 'pool balance must be a non-negative integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_predictive_reward_' || p_network || '_' || p_app_id,0)
  );

  if exists(
    select 1 from public.reward_rounds rr
    where rr.network = p_network and rr.app_id = p_app_id
      and rr.status in ('CREATED','PAYING')
      and rr.broadcast_confirmed_at is null
  ) then
    raise exception 'Finish the current reward round before preparing another one';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id = p_allocation_receipt_id for share;

  if not found or v_receipt.network <> p_network or v_receipt.app_id <> p_app_id then
    raise exception 'VeBetter allocation receipt does not match the active reward pool';
  end if;

  -- Keep batch pool protection aligned with the same authority used by
  -- forecasting and reservation commit. This includes post-base LIVE X
  -- promotion liability while remaining a no-op before LIVE activation.
  v_reserved_existing := public.read_outstanding_reward_liability(
    p_network,
    p_app_id
  )::numeric;

  if v_reserved_existing > p_pool_balance_wei then
    raise exception 'reserved reward liability exceeds the observed reward pool';
  end if;

  select * into v_epoch
  from public.reward_budget_epochs e
  where e.allocation_receipt_id = v_receipt.id;

  if not found then
    insert into public.reward_budget_epochs(
      network,app_id,allocation_receipt_id,vebetter_round_id,
      allocation_rewards_wei,opening_pool_balance_wei,opening_reserved_wei,
      expected_completions,stress_completions,reward_per_invite_wei,
      algorithm_version,pipeline_snapshot
    ) values (
      p_network,p_app_id,v_receipt.id,v_receipt.vebetter_round_id,
      v_receipt.rewards_allocation_amount_wei,p_pool_balance_wei,v_reserved_existing,
      greatest(p_expected_completions,0),greatest(p_stress_completions,1),
      greatest(p_reward_per_invite_wei,0),p_algorithm_version,
      coalesce(p_pipeline_snapshot,'{}'::jsonb)
    ) returning * into v_epoch;
    v_epoch_created := true;
  end if;

  select coalesce(array_agg(c.invite_code order by c.claim_requested_at,c.invite_code),array[]::text[])
  into v_candidate_codes
  from (
    select q.invite_code,q.claim_requested_at
    from public.reward_queue_entries q
    join public.invitations i on i.invite_code = q.invite_code
    where q.network = p_network and q.status = 'QUEUED'
      and q.assigned_round_id is null and q.claim_requested_at is not null
      and q.claim_requested_by_wallet = q.recipient_wallet
      and q.reserved_amount_wei is not null and q.reserved_amount_wei > 0
      and q.reserved_at is not null
      and i.reward_funding_allocation_receipt_id = v_receipt.id
      and i.reward_cohort_round_id = v_receipt.vebetter_round_id + 1
      and i.status = 'COMPLETED' and i.reward_status = 'ELIGIBLE'
      and i.sybil_status = 'CLEAR' and lower(i.inviter_wallet) = q.recipient_wallet
      and not exists (
        select 1 from public.reward_payouts rp where rp.invite_code = q.invite_code
      )
    order by q.claim_requested_at,q.invite_code
    limit v_batch_limit
    for update of q,i
  ) c;

  v_eligible_count := coalesce(cardinality(v_candidate_codes),0);
  if v_eligible_count = 0 then
    return jsonb_build_object(
      'epochId',v_epoch.id,'roundId',null,'epochCreated',v_epoch_created,
      'reason','NO_CLAIMED_REWARDS'
    );
  end if;

  select coalesce(sum(
    public.read_reward_batch_transfer_amount_wei_v1(q.invite_code)
  ),0)
  into v_distributable
  from public.reward_queue_entries q
  where q.invite_code = any(v_candidate_codes);

  if v_distributable <= 0 or v_distributable > p_pool_balance_wei then
    raise exception 'claimed reward batch exceeds the observed reward pool';
  end if;
  v_remainder := p_pool_balance_wei - v_distributable;

  insert into public.reward_rounds(
    network,app_id,status,observed_pool_balance_wei,reserved_before_round_wei,
    distributable_wei,eligible_count,per_reward_wei,remainder_wei,reward_budget_epoch_id
  ) values (
    p_network,p_app_id,'CREATED',p_pool_balance_wei,v_reserved_existing,
    v_distributable,v_eligible_count,0,v_remainder,v_epoch.id
  ) returning id into v_round_id;

  insert into public.reward_payouts(round_id,invite_code,recipient_wallet,amount_wei,status)
  select
    v_round_id,
    q.invite_code,
    q.recipient_wallet,
    public.read_reward_batch_transfer_amount_wei_v1(q.invite_code),
    'PENDING'
  from public.reward_queue_entries q
  where q.invite_code = any(v_candidate_codes)
    and q.status = 'QUEUED' and q.assigned_round_id is null
  order by q.claim_requested_at,q.invite_code;
  get diagnostics v_payout_count = row_count;

  if v_payout_count <> v_eligible_count then
    raise exception 'reward payout count does not match claimed reservation count';
  end if;

  update public.reward_queue_entries q
  set status = 'ASSIGNED',assigned_round_id = v_round_id,assigned_at = v_now
  where q.invite_code = any(v_candidate_codes)
    and q.status = 'QUEUED' and q.assigned_round_id is null;
  get diagnostics v_assigned_count = row_count;

  if v_assigned_count <> v_eligible_count then
    raise exception 'reward queue assignment count does not match claimed reservation count';
  end if;

  return jsonb_build_object(
    'epochId',v_epoch.id,'roundId',v_round_id,'epochCreated',v_epoch_created,
    'reason','BATCH_PREPARED','recipientCount',v_eligible_count,
    'distributableWei',v_distributable::text,'remainingPoolWei',v_remainder::text,
    'amountMode','PER_INVITATION_FIXED_RESERVATION',
    'allocationReceiptId',v_receipt.id,
    'rewardCohortRoundId',v_receipt.vebetter_round_id + 1
  );
end;
$function$;
