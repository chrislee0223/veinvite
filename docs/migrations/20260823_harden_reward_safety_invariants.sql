-- VeInvite automatic rewards - safety hardening
--
-- Goals:
-- 1. Keep reward eligibility tied to complete on-chain evidence.
-- 2. Snapshot the exact invitation set used to calculate a reward round.
-- 3. Reserve unfinished payouts only from the same network/app pool.
-- 4. Keep SECURITY DEFINER entry points unavailable to public API roles.
--
-- This migration does not transfer B3TR.
-- Baseline schema prerequisite: reward_payouts.invite_code and tx_id are
-- protected by unique constraints/indexes.

begin;

-- Some Preview databases contain this Supabase helper. It is an event-trigger
-- implementation detail and should not be callable through PostgREST.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

-- Keep the updated_at trigger helper on a deterministic search path when it
-- exists in the environment.
do $$
begin
  if to_regprocedure('public.set_invitations_updated_at()') is not null then
    execute 'alter function public.set_invitations_updated_at() set search_path = public';
  end if;
end
$$;

create or replace function public.sync_invitation_reward_eligibility()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Paid records are immutable settlement history.
  if coalesce(new.reward_status::text, '') = 'PAID' then
    return new;
  end if;

  new.reward_paid_at := null;

  if new.status = 'CANCELLED' then
    new.reward_status := 'FORFEITED';
    new.reward_eligible_at := null;
    return new;
  end if;

  -- Three-app evidence is valid only when it is anchored after activation.
  if new.invitee_wallet is null
     or new.activation_block is null
     or coalesce(new.apps_completed, 0) < 3
     or new.apps_completed_block is null
     or new.apps_completed_block < new.activation_block then
    new.apps_completed_at := null;
    new.apps_completed_block := null;
    new.vote_completed := false;
    new.vote_completed_at := null;
    new.vote_completed_block := null;
    new.vote_round_id := null;
  else
    -- A qualifying vote must have complete metadata and happen no earlier than
    -- the third-app completion block.
    if coalesce(new.vote_completed, false) = false
       or new.vote_completed_block is null
       or new.vote_round_id is null
       or new.vote_completed_block < new.apps_completed_block then
      new.vote_completed := false;
      new.vote_completed_at := null;
      new.vote_completed_block := null;
      new.vote_round_id := null;
    end if;
  end if;

  if new.status = 'COMPLETED'
     and new.invitee_wallet is not null
     and new.activation_block is not null
     and coalesce(new.apps_completed, 0) >= 3
     and new.apps_completed_block is not null
     and new.apps_completed_block >= new.activation_block
     and coalesce(new.vote_completed, false) = true
     and new.vote_completed_block is not null
     and new.vote_round_id is not null
     and new.vote_completed_block >= new.apps_completed_block then
    new.reward_status := 'ELIGIBLE';
    new.reward_eligible_at := coalesce(
      new.reward_eligible_at,
      new.vote_completed_at,
      now()
    );
  elsif new.invitee_wallet is not null then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  else
    new.reward_status := 'NONE';
    new.reward_eligible_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.prepare_reward_round(
  p_network text,
  p_app_id text,
  p_pool_balance_wei numeric
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_codes text[] := array[]::text[];
  v_eligible_count integer;
  v_reserved_existing numeric(78, 0);
  v_available_to_reserve numeric(78, 0);
  v_per_reward numeric(78, 0);
  v_remainder numeric(78, 0);
  v_round_id bigint;
  v_invalid_wallet_code text;
begin
  if p_pool_balance_wei is null or p_pool_balance_wei <= 0 then
    return null;
  end if;

  if p_network is null or btrim(p_network) = '' then
    raise exception 'network is required';
  end if;

  if p_app_id is null or p_app_id !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception 'app_id must be a 32-byte hex value';
  end if;

  -- One preparation at a time for this exact network/app pool.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_round_' || lower(btrim(p_network)) || '_' || lower(p_app_id),
      0
    )
  );

  select coalesce(sum(rp.amount_wei), 0)
  into v_reserved_existing
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id = rp.round_id
  where rp.status in ('PENDING', 'SENDING', 'FAILED')
    and lower(rr.network) = lower(btrim(p_network))
    and lower(rr.app_id) = lower(p_app_id);

  v_available_to_reserve := greatest(
    p_pool_balance_wei - v_reserved_existing,
    0
  );

  if v_available_to_reserve <= 0 then
    return null;
  end if;

  -- Lock and snapshot the exact candidates used by this calculation. New
  -- eligibility that appears later waits for the next round.
  select coalesce(
    array_agg(c.invite_code order by c.reward_eligible_at nulls last, c.invite_code),
    array[]::text[]
  )
  into v_candidate_codes
  from (
    select i.invite_code, i.reward_eligible_at
    from public.invitations i
    where i.status = 'COMPLETED'
      and i.reward_status = 'ELIGIBLE'
      and not exists (
        select 1
        from public.reward_payouts rp
        where rp.invite_code = i.invite_code
      )
    order by i.reward_eligible_at nulls last, i.invite_code
    for update of i
  ) c;

  v_eligible_count := coalesce(cardinality(v_candidate_codes), 0);

  if v_eligible_count = 0 then
    return null;
  end if;

  -- Invalid payout destinations abort the whole round instead of silently
  -- skipping a qualifying invitation.
  select i.invite_code
  into v_invalid_wallet_code
  from public.invitations i
  where i.invite_code = any(v_candidate_codes)
    and (
      i.inviter_wallet is null
      or lower(i.inviter_wallet) !~ '^0x[0-9a-f]{40}$'
    )
  limit 1;

  if v_invalid_wallet_code is not null then
    raise exception 'invalid inviter wallet for invite %', v_invalid_wallet_code;
  end if;

  v_per_reward := floor(v_available_to_reserve / v_eligible_count);

  if v_per_reward < 1 then
    return null;
  end if;

  v_remainder :=
    v_available_to_reserve - (v_per_reward * v_eligible_count);

  insert into public.reward_rounds (
    network,
    app_id,
    status,
    observed_pool_balance_wei,
    reserved_before_round_wei,
    distributable_wei,
    eligible_count,
    per_reward_wei,
    remainder_wei
  ) values (
    lower(btrim(p_network)),
    lower(p_app_id),
    'CREATED',
    p_pool_balance_wei,
    v_reserved_existing,
    v_per_reward * v_eligible_count,
    v_eligible_count,
    v_per_reward,
    v_remainder
  ) returning id into v_round_id;

  insert into public.reward_payouts (
    round_id,
    invite_code,
    recipient_wallet,
    amount_wei,
    status
  )
  select
    v_round_id,
    i.invite_code,
    lower(i.inviter_wallet),
    v_per_reward,
    'PENDING'
  from public.invitations i
  where i.invite_code = any(v_candidate_codes)
  order by i.reward_eligible_at nulls last, i.invite_code;

  return v_round_id;
end;
$$;

revoke all on function public.prepare_reward_round(text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.prepare_reward_round(text, text, numeric)
  to service_role;

-- Re-run evidence normalization on rows most likely to contain historical
-- checkpoints. This does not create payouts or transfer tokens.
update public.invitations
set reward_status = reward_status
where status = 'COMPLETED'
   or vote_completed = true
   or apps_completed > 0;

commit;
