-- VeInvite audit hardening: reward eligibility must be backed by append-only
-- raw chain evidence, not only mutable invitation counters/checkpoints.
--
-- Applied and tested on Preview first. This migration does not transfer B3TR.

begin;

create or replace function public.sync_invitation_reward_eligibility()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_has_paid_payout boolean := false;
  v_has_eligible_entry_check boolean := false;
  v_has_three_reward_events boolean := false;
  v_has_third_app_checkpoint boolean := false;
  v_has_vote_event boolean := false;
begin
  select exists(
    select 1
    from public.reward_payouts rp
    where rp.invite_code = new.invite_code
      and rp.status = 'PAID'
      and rp.tx_id is not null
      and rp.paid_at is not null
  ) into v_has_paid_payout;

  -- Settlement history wins over later state changes.
  if v_has_paid_payout then
    new.reward_status := 'PAID';
    if new.reward_paid_at is null then
      select rp.paid_at
      into new.reward_paid_at
      from public.reward_payouts rp
      where rp.invite_code = new.invite_code
        and rp.status = 'PAID'
      order by rp.paid_at desc
      limit 1;
    end if;
    return new;
  end if;

  new.reward_paid_at := null;

  if new.status = 'CANCELLED' or new.sybil_status = 'BLOCKED' then
    new.reward_status := 'FORFEITED';
    new.reward_eligible_at := null;
    return new;
  end if;

  if new.invitee_wallet is null
     or new.activation_block is null
     or new.activation_network is null
     or coalesce(new.apps_completed,0) < 3
     or new.apps_completed_at is null
     or new.apps_completed_block is null
     or new.apps_completed_block < new.activation_block then
    new.apps_completed_at := null;
    new.apps_completed_block := null;
    new.vote_completed := false;
    new.vote_completed_at := null;
    new.vote_completed_block := null;
    new.vote_round_id := null;
  else
    if coalesce(new.vote_completed,false)=false
       or new.vote_completed_at is null
       or new.vote_completed_block is null
       or new.vote_round_id is null
       or new.vote_completed_block < new.apps_completed_block then
      new.vote_completed := false;
      new.vote_completed_at := null;
      new.vote_completed_block := null;
      new.vote_round_id := null;
    end if;
  end if;

  if new.eligibility_check_id is not null
     and new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null then
    select exists(
      select 1
      from public.eligibility_check_events e
      where e.id = new.eligibility_check_id
        and e.invite_code = new.invite_code
        and e.wallet_address = lower(new.invitee_wallet)
        and e.network = new.activation_network
        and e.outcome = 'ELIGIBLE'
        and e.checked_block <= new.activation_block
    ) into v_has_eligible_entry_check;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null
     and new.apps_completed_at is not null
     and new.apps_completed_block is not null then
    select count(distinct e.app_id) >= 3
    into v_has_three_reward_events
    from public.invite_impact_events e
    where e.invite_code = new.invite_code
      and e.network = new.activation_network
      and e.wallet_address = lower(new.invitee_wallet)
      and e.event_type = 'DAPP_REWARD'
      and e.block_number >= new.activation_block
      and e.block_number <= new.apps_completed_block;

    select exists(
      select 1
      from public.invite_impact_events e
      where e.invite_code = new.invite_code
        and e.network = new.activation_network
        and e.wallet_address = lower(new.invitee_wallet)
        and e.event_type = 'DAPP_REWARD'
        and e.block_number = new.apps_completed_block
        and e.block_timestamp = new.apps_completed_at
    ) into v_has_third_app_checkpoint;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.vote_completed_at is not null
     and new.vote_completed_block is not null
     and new.vote_round_id is not null then
    select exists(
      select 1
      from public.invite_impact_events e
      where e.invite_code = new.invite_code
        and e.network = new.activation_network
        and e.wallet_address = lower(new.invitee_wallet)
        and e.event_type = 'ALLOCATION_VOTE'
        and e.block_number = new.vote_completed_block
        and e.block_timestamp = new.vote_completed_at
        and e.vote_round_id = new.vote_round_id
    ) into v_has_vote_event;
  end if;

  if new.status = 'COMPLETED'
     and v_has_eligible_entry_check
     and v_has_three_reward_events
     and v_has_third_app_checkpoint
     and v_has_vote_event
     and new.impact_sync_complete_at is not null
     and new.invitee_wallet is not null
     and new.activation_block is not null
     and new.activation_network is not null
     and coalesce(new.apps_completed,0) >= 3
     and new.apps_completed_at is not null
     and new.apps_completed_block is not null
     and new.apps_completed_block >= new.activation_block
     and coalesce(new.vote_completed,false) = true
     and new.vote_completed_at is not null
     and new.vote_completed_block is not null
     and new.vote_round_id is not null
     and new.vote_completed_block >= new.apps_completed_block
     and new.sybil_status = 'CLEAR'
     and new.sybil_checked_at is not null
     and new.sybil_checked_at >= new.vote_completed_at then
    new.reward_status := 'ELIGIBLE';
    new.reward_eligible_at := coalesce(
      new.reward_eligible_at,
      new.impact_sync_complete_at,
      new.sybil_checked_at,
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
  v_reserved_existing numeric(78,0);
  v_available_to_reserve numeric(78,0);
  v_per_reward numeric(78,0);
  v_remainder numeric(78,0);
  v_round_id bigint;
  v_invalid_wallet_code text;
begin
  if p_pool_balance_wei is null
     or p_pool_balance_wei <= 0
     or p_pool_balance_wei <> trunc(p_pool_balance_wei) then
    return null;
  end if;

  p_network := lower(btrim(p_network));
  p_app_id := lower(p_app_id);

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_app_id is null or p_app_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'app_id must be a 32-byte hex value';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_round_'||p_network||'_'||p_app_id,0)
  );

  select coalesce(sum(rp.amount_wei),0)
  into v_reserved_existing
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id = rp.round_id
  where rp.status in ('PENDING','SENDING','FAILED')
    and rr.network = p_network
    and rr.app_id = p_app_id;

  v_available_to_reserve := greatest(p_pool_balance_wei-v_reserved_existing,0);
  if v_available_to_reserve <= 0 then
    return null;
  end if;

  select coalesce(
    array_agg(c.invite_code order by c.reward_eligible_at,c.invite_code),
    array[]::text[]
  )
  into v_candidate_codes
  from (
    select i.invite_code,i.reward_eligible_at
    from public.invitations i
    where i.status = 'COMPLETED'
      and i.reward_status = 'ELIGIBLE'
      and i.reward_eligible_at is not null
      and i.sybil_status = 'CLEAR'
      and i.activation_network = p_network
      and i.eligibility_check_id is not null
      and i.impact_sync_complete_at is not null
      and exists (
        select 1
        from public.eligibility_check_events e
        where e.id=i.eligibility_check_id
          and e.invite_code=i.invite_code
          and e.wallet_address=i.invitee_wallet
          and e.network=p_network
          and e.outcome='ELIGIBLE'
          and e.checked_block <= i.activation_block
      )
      and (
        select count(distinct ev.app_id)
        from public.invite_impact_events ev
        where ev.invite_code=i.invite_code
          and ev.network=p_network
          and ev.wallet_address=i.invitee_wallet
          and ev.event_type='DAPP_REWARD'
          and ev.block_number >= i.activation_block
          and ev.block_number <= i.apps_completed_block
      ) >= 3
      and exists (
        select 1
        from public.invite_impact_events ev
        where ev.invite_code=i.invite_code
          and ev.network=p_network
          and ev.wallet_address=i.invitee_wallet
          and ev.event_type='DAPP_REWARD'
          and ev.block_number=i.apps_completed_block
          and ev.block_timestamp=i.apps_completed_at
      )
      and exists (
        select 1
        from public.invite_impact_events ev
        where ev.invite_code=i.invite_code
          and ev.network=p_network
          and ev.wallet_address=i.invitee_wallet
          and ev.event_type='ALLOCATION_VOTE'
          and ev.block_number=i.vote_completed_block
          and ev.block_timestamp=i.vote_completed_at
          and ev.vote_round_id=i.vote_round_id
      )
      and not exists (
        select 1
        from public.reward_payouts rp
        where rp.invite_code=i.invite_code
      )
    order by i.reward_eligible_at,i.invite_code
    for update of i
  ) c;

  v_eligible_count := coalesce(cardinality(v_candidate_codes),0);
  if v_eligible_count=0 then
    return null;
  end if;

  select i.invite_code
  into v_invalid_wallet_code
  from public.invitations i
  where i.invite_code=any(v_candidate_codes)
    and (i.inviter_wallet is null or lower(i.inviter_wallet) !~ '^0x[0-9a-f]{40}$')
  limit 1;

  if v_invalid_wallet_code is not null then
    raise exception 'invalid inviter wallet for invite %',v_invalid_wallet_code;
  end if;

  v_per_reward := floor(v_available_to_reserve/v_eligible_count);
  if v_per_reward < 1 then
    return null;
  end if;

  v_remainder := v_available_to_reserve-(v_per_reward*v_eligible_count);

  insert into public.reward_rounds(
    network,app_id,status,observed_pool_balance_wei,reserved_before_round_wei,
    distributable_wei,eligible_count,per_reward_wei,remainder_wei
  ) values (
    p_network,p_app_id,'CREATED',p_pool_balance_wei,v_reserved_existing,
    v_per_reward*v_eligible_count,v_eligible_count,v_per_reward,v_remainder
  ) returning id into v_round_id;

  insert into public.reward_payouts(
    round_id,invite_code,recipient_wallet,amount_wei,status
  )
  select v_round_id,i.invite_code,lower(i.inviter_wallet),v_per_reward,'PENDING'
  from public.invitations i
  where i.invite_code=any(v_candidate_codes)
  order by i.reward_eligible_at,i.invite_code;

  return v_round_id;
end;
$$;

revoke all on function public.prepare_reward_round(text,text,numeric)
  from public,anon,authenticated;
grant execute on function public.prepare_reward_round(text,text,numeric)
  to service_role;

commit;
