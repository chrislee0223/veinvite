create or replace function public.read_outstanding_reward_liability(
  p_network text,
  p_app_id text
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_app_id text := lower(btrim(coalesce(p_app_id,'')));
  v_reserved_existing numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
  v_post_base_promotion numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if v_app_id<>v_veinvite_app_id then
    raise exception 'reward liability can only target the VeInvite app';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_reserved_existing
  from public.reward_queue_entries q
  where q.network=v_network
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1
      from public.reward_payouts paid
      where paid.invite_code=q.invite_code
        and paid.status='PAID'
    );

  select coalesce(sum(rp.amount_wei),0)
  into v_legacy_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  where rr.network=v_network
    and rr.app_id=v_app_id
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code=rp.invite_code
        and q.reserved_amount_wei is not null
    );

  v_post_base_promotion :=
    public.read_reward_x_promotion_post_base_liability_wei(
      v_network,
      v_app_id
    );

  if v_post_base_promotion<0 then
    raise exception 'REWARD_X_PROMOTION_NEGATIVE_POST_BASE_LIABILITY';
  end if;

  return (
    v_reserved_existing +
    v_legacy_reserved +
    v_post_base_promotion
  )::text;
end;
$function$;

create or replace function public.read_reward_cohort_committed_wei(
  p_network text,
  p_app_id text,
  p_reward_cohort_round_id bigint,
  p_allocation_receipt_id bigint
)
returns numeric
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_queue_committed numeric(78,0) := 0;
  v_offset_committed numeric(78,0) := 0;
  v_released_promotion numeric(78,0) := 0;
begin
  p_network:=lower(btrim(p_network));
  p_app_id:=lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_reward_cohort_round_id is null or p_reward_cohort_round_id<1 then
    raise exception 'invalid reward cohort round';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id=p_allocation_receipt_id
    and a.network=p_network
    and a.app_id=p_app_id;

  if not found
     or v_receipt.vebetter_round_id+1<>p_reward_cohort_round_id then
    raise exception 'allocation receipt does not fund the requested reward cohort';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_queue_committed
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code=q.invite_code
  where q.network=p_network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=p_reward_cohort_round_id
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');

  select coalesce(sum(s.offset_amount_wei),0)
  into v_offset_committed
  from public.reward_recovery_settlements s
  join public.invitations i on i.invite_code=s.invite_code
  where s.network=p_network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=p_reward_cohort_round_id
    and not public.is_sybil_v2_referral_invalidated(
      s.invite_code,
      p_network
    )
    and not exists (
      select 1
      from public.reward_recovery_obligations o
      where o.source_settlement_id=s.id
        and o.status='ACTIVE'
    );

  v_released_promotion :=
    public.read_reward_x_promotion_cohort_released_wei(
      p_network,
      p_app_id,
      p_reward_cohort_round_id,
      p_allocation_receipt_id
    );

  if v_released_promotion<0
     or v_released_promotion>v_queue_committed then
    raise exception 'REWARD_X_PROMOTION_RELEASE_COMMITMENT_MISMATCH';
  end if;

  return
    (v_queue_committed-v_released_promotion) +
    v_offset_committed;
end;
$function$;

comment on function public.read_outstanding_reward_liability(text,text) is
  'Authoritative outstanding reward liability, including X promotion value that remains owed after an exact base payout finalizes.';

comment on function public.read_reward_cohort_committed_wei(text,text,bigint,bigint) is
  'Authoritative cohort commitment. A RELEASED X promotion offsets only the still-counted queue reservation from which it originated.';
