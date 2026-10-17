-- Ensure additive-v2 bonus budget refusal is a durable fail-soft exemption.
-- The first additive migration extended the table constraint but the recorder's
-- explicit allow-list also needs the new reason.

create or replace function public.record_reward_x_promotion_split_exemption_v1(
  p_queue_entry_id bigint,
  p_invite_code text,
  p_reason text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_queue public.reward_queue_entries%rowtype;
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_reason text := upper(btrim(coalesce(p_reason,'')));
  v_details jsonb := coalesce(p_details,'{}'::jsonb);
begin
  if p_queue_entry_id is null or p_queue_entry_id<=0 then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_QUEUE_REQUIRED';
  end if;

  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  if v_reason not in (
    'FEATURE_DISABLED_AFTER_LIVE_START',
    'LIVE_START_MISSING',
    'POLICY_UNSUPPORTED',
    'DEPENDENCY_GATE_NOT_READY',
    'EXTERNAL_READY_START_MISSING',
    'BEFORE_EXTERNAL_READY_START',
    'EXTERNAL_RUNTIME_NOT_READY',
    'ACTIVE_REFERRAL_LINK_MISSING',
    'PROMOTION_BUDGET_UNAVAILABLE',
    'SPLIT_CREATION_FAILED'
  ) then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_REASON_INVALID';
  end if;

  if jsonb_typeof(v_details)<>'object' then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_DETAILS_INVALID';
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.id=p_queue_entry_id
    and q.invite_code=v_code;

  if not found
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<=0
     or v_queue.reserved_at is null
     or v_queue.recipient_wallet is null
     or v_queue.network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_QUEUE_MISMATCH';
  end if;

  if exists (
    select 1
    from public.reward_x_promotion_splits s
    where s.queue_entry_id=v_queue.id
       or s.invite_code=v_queue.invite_code
  ) then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_SPLIT_EXISTS';
  end if;

  insert into public.reward_x_promotion_split_exemptions(
    queue_entry_id,
    invite_code,
    network,
    recipient_wallet,
    reservation_amount_wei,
    exemption_reason,
    policy_version,
    details
  ) values (
    v_queue.id,
    v_queue.invite_code,
    v_queue.network,
    lower(v_queue.recipient_wallet),
    v_queue.reserved_amount_wei,
    v_reason,
    'x-promotion-additive-v2',
    v_details
  )
  on conflict (queue_entry_id) do nothing;
end;
$function$;

revoke all on function public.record_reward_x_promotion_split_exemption_v1(
  bigint,text,text,jsonb
) from PUBLIC,anon,authenticated;
grant execute on function public.record_reward_x_promotion_split_exemption_v1(
  bigint,text,text,jsonb
) to service_role;

do $$
begin
  if position(
    'PROMOTION_BUDGET_UNAVAILABLE'
    in pg_get_functiondef(
      'public.record_reward_x_promotion_split_exemption_v1(bigint,text,text,jsonb)'::regprocedure
    )
  )=0 then
    raise exception 'REWARD_X_PROMOTION_BUDGET_EXEMPTION_RECORDER_NOT_UPDATED';
  end if;
end $$;
