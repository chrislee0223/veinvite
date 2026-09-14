begin;

alter table public.reward_rounds
  add column if not exists broadcast_confirmed_at timestamptz;

comment on column public.reward_rounds.broadcast_confirmed_at is
  'Set only after the exact journaled payout transaction and its receipt are observed on-chain. This releases preparation of later claimed batches but does not mark any payout or invitation PAID; full finality settlement remains authoritative.';

drop index if exists public.reward_rounds_one_open_per_network_app_idx;

create unique index reward_rounds_one_open_per_network_app_idx
  on public.reward_rounds (network, app_id)
  where status = any (array['CREATED'::text, 'PAYING'::text])
    and broadcast_confirmed_at is null;

create or replace function public.mark_reward_payout_broadcast_confirmed(
  p_manifest_id bigint,
  p_tx_id text
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_manifest public.reward_payout_manifests%rowtype;
  v_round public.reward_rounds%rowtype;
  v_submission public.reward_payout_transaction_submissions%rowtype;
  v_signed public.reward_payout_signed_transactions%rowtype;
  v_payout_count integer := 0;
  v_pending_count integer := 0;
  v_total_amount numeric(78,0) := 0;
  v_created boolean := false;
begin
  p_tx_id := lower(btrim(p_tx_id));

  if p_manifest_id is null or p_manifest_id < 1 then
    raise exception 'manifest_id must be positive';
  end if;

  if p_tx_id is null or p_tx_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'tx_id must be a lowercase 32-byte hex value';
  end if;

  select *
  into v_manifest
  from public.reward_payout_manifests
  where id = p_manifest_id;

  if not found then
    raise exception 'reward payout manifest not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_broadcast_' || v_manifest.round_id::text,
      0
    )
  );

  select *
  into v_round
  from public.reward_rounds
  where id = v_manifest.round_id
  for update;

  if not found then
    raise exception 'reward round not found';
  end if;

  if v_round.network <> v_manifest.network
     or v_round.app_id <> v_manifest.app_id then
    raise exception 'reward round identity does not match payout manifest';
  end if;

  if v_round.status = 'COMPLETED' then
    if exists (
      select 1
      from public.reward_payout_transaction_settlements s
      where s.manifest_id = p_manifest_id
        and s.tx_id = p_tx_id
    ) then
      return jsonb_build_object(
        'round_id', v_round.id,
        'tx_id', p_tx_id,
        'created', false,
        'already_finalized', true,
        'broadcast_confirmed_at', v_round.broadcast_confirmed_at
      );
    end if;

    raise exception 'completed reward round does not match the submitted transaction';
  end if;

  if v_round.status <> 'CREATED' then
    raise exception 'reward round must be CREATED before broadcast confirmation';
  end if;

  select *
  into v_submission
  from public.reward_payout_transaction_submissions
  where manifest_id = p_manifest_id;

  if not found then
    raise exception 'reward payout transaction submission not found';
  end if;

  select *
  into v_signed
  from public.reward_payout_signed_transactions
  where manifest_id = p_manifest_id;

  if not found then
    raise exception 'reward payout signed transaction not found';
  end if;

  if v_submission.round_id <> v_round.id
     or v_signed.round_id <> v_round.id
     or v_submission.manifest_hash <> v_manifest.manifest_hash
     or v_signed.manifest_hash <> v_manifest.manifest_hash
     or v_submission.operator_wallet <> v_manifest.operator_wallet
     or v_signed.operator_wallet <> v_manifest.operator_wallet
     or v_submission.tx_id <> p_tx_id
     or v_signed.tx_id <> p_tx_id then
    raise exception 'reward payout transaction journal does not match immutable manifest';
  end if;

  if exists (
    select 1
    from public.reward_payout_transaction_settlements s
    where s.tx_id = p_tx_id
      and s.manifest_id <> p_manifest_id
  ) then
    raise exception 'transaction is already bound to another reward manifest';
  end if;

  select
    count(*),
    count(*) filter (where status = 'PENDING' and tx_id is null),
    coalesce(sum(amount_wei), 0)
  into
    v_payout_count,
    v_pending_count,
    v_total_amount
  from public.reward_payouts
  where round_id = v_round.id;

  if v_payout_count <> v_manifest.payout_count
     or v_pending_count <> v_payout_count then
    raise exception 'all broadcast-confirmed manifest payouts must remain PENDING with no tx_id';
  end if;

  if v_total_amount <> v_manifest.total_amount_wei
     or v_total_amount <> v_round.distributable_wei then
    raise exception 'broadcast-confirmed payout total no longer matches manifest and reward round';
  end if;

  if v_round.broadcast_confirmed_at is null then
    update public.reward_rounds
    set broadcast_confirmed_at = now()
    where id = v_round.id
      and status = 'CREATED'
      and broadcast_confirmed_at is null;

    if not found then
      raise exception 'reward round broadcast confirmation could not be recorded';
    end if;

    v_created := true;
  end if;

  select *
  into v_round
  from public.reward_rounds
  where id = v_manifest.round_id;

  return jsonb_build_object(
    'round_id', v_round.id,
    'tx_id', p_tx_id,
    'created', v_created,
    'already_finalized', false,
    'broadcast_confirmed_at', v_round.broadcast_confirmed_at
  );
end;
$function$;

revoke all on function public.mark_reward_payout_broadcast_confirmed(bigint, text)
  from public, anon, authenticated;
grant execute on function public.mark_reward_payout_broadcast_confirmed(bigint, text)
  to service_role;

create or replace function public.prepare_reward_cohort_batch(
  p_network text,
  p_app_id text,
  p_pool_balance_wei numeric,
  p_allocation_receipt_id bigint,
  p_expected_completions integer,
  p_stress_completions integer,
  p_reward_per_invite_wei numeric,
  p_algorithm_version text,
  p_pipeline_snapshot jsonb
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
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

  select coalesce(sum(q.reserved_amount_wei),0) into v_reserved_existing
  from public.reward_queue_entries q
  where q.network = p_network and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1 from public.reward_payouts paid
      where paid.invite_code = q.invite_code and paid.status = 'PAID'
    );

  select coalesce(sum(rp.amount_wei),0) into v_legacy_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id = rp.round_id
  where rr.network = p_network and rr.app_id = p_app_id
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1 from public.reward_queue_entries q
      where q.invite_code = rp.invite_code and q.reserved_amount_wei is not null
    );
  v_reserved_existing := v_reserved_existing + v_legacy_reserved;

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

  select coalesce(sum(q.reserved_amount_wei),0) into v_distributable
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
  select v_round_id,q.invite_code,q.recipient_wallet,q.reserved_amount_wei,'PENDING'
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

commit;
