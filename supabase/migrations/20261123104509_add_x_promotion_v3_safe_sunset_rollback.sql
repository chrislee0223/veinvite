-- One-way rollback window: new invitations after sunset return to v2,
-- while invitations created within the v3 window keep their 90/10 contract.
alter table public.reward_runtime_config
 add column if not exists reward_x_promotion_v3_sunset_at timestamptz;
CREATE OR REPLACE FUNCTION public.reward_x_promotion_policy_for_invitation_v3(p_invite_code text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_created_at timestamptz; v_cutover timestamptz; v_sunset timestamptz;
begin
 select i.created_at,c.reward_x_promotion_v3_cutover_at,c.reward_x_promotion_v3_sunset_at into v_created_at,v_cutover,v_sunset
 from public.invitations i cross join public.reward_runtime_config c
 where i.invite_code=upper(btrim(coalesce(p_invite_code,''))) and c.id=1;
 if not found then raise exception 'REWARD_X_INVITATION_OR_CONFIG_MISSING'; end if;
 if v_cutover is not null and v_created_at>=v_cutover and (v_sunset is null or v_created_at<v_sunset) then return 'x-promotion-withheld-10pct-v3'; end if;
 return 'x-promotion-additive-v2';
end $function$;
CREATE OR REPLACE FUNCTION public.guard_reward_x_promotion_v3_cutover()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
 if old.reward_x_promotion_v3_sunset_at is not null
   and new.reward_x_promotion_v3_sunset_at is distinct from old.reward_x_promotion_v3_sunset_at
 then raise exception 'REWARD_X_V3_SUNSET_IMMUTABLE'; end if;
 if old.reward_x_promotion_v3_cutover_at is not null
   and new.reward_x_promotion_v3_cutover_at is distinct from old.reward_x_promotion_v3_cutover_at
 then raise exception 'REWARD_X_V3_CUTOVER_IMMUTABLE'; end if;
 if new.reward_x_promotion_v3_sunset_at is not null then
   if new.reward_x_promotion_v3_cutover_at is null
      or new.reward_x_promotion_v3_sunset_at<new.reward_x_promotion_v3_cutover_at then
     raise exception 'REWARD_X_V3_SUNSET_BOUNDARY_INVALID';
   end if;
   if old.reward_x_promotion_v3_sunset_at is null then
     if new.reward_x_promotion_policy_version<>'x-promotion-additive-v2' then
       raise exception 'REWARD_X_V3_SUNSET_REQUIRES_LEGACY_POLICY';
     end if;
     if new.reward_x_promotion_v3_sunset_at<clock_timestamp()-interval '60 seconds'
       or new.reward_x_promotion_v3_sunset_at>clock_timestamp()+interval '10 seconds' then
       raise exception 'REWARD_X_V3_SUNSET_NOT_FRESH';
     end if;
   end if;
 end if;
 if old.reward_x_promotion_policy_version='x-promotion-withheld-10pct-v3'
    and new.reward_x_promotion_policy_version='x-promotion-additive-v2'
    and new.reward_x_promotion_v3_sunset_at is null then
   raise exception 'REWARD_X_V3_SUNSET_REQUIRED_FOR_ROLLBACK';
 end if;
 if new.reward_x_promotion_policy_version='x-promotion-withheld-10pct-v3' then
   if new.reward_x_promotion_v3_sunset_at is not null then
     raise exception 'REWARD_X_V3_CANNOT_REOPEN_AFTER_SUNSET';
   end if;
   if new.reward_x_promotion_v3_cutover_at is null then
     raise exception 'REWARD_X_V3_CUTOVER_REQUIRED';
   end if;
   if old.reward_x_promotion_policy_version<>'x-promotion-withheld-10pct-v3'
      and (new.reward_x_promotion_v3_cutover_at<clock_timestamp()-interval '60 seconds'
        or new.reward_x_promotion_v3_cutover_at>clock_timestamp()+interval '10 seconds')
   then raise exception 'REWARD_X_V3_CUTOVER_NOT_FRESH'; end if;
 end if;
 return new;
end $function$;
drop trigger if exists guard_reward_x_promotion_v3_cutover_trigger on public.reward_runtime_config;
create trigger guard_reward_x_promotion_v3_cutover_trigger
before update of reward_x_promotion_policy_version,reward_x_promotion_v3_cutover_at,reward_x_promotion_v3_sunset_at
on public.reward_runtime_config for each row
execute function public.guard_reward_x_promotion_v3_cutover();
CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_shadow_audit(p_network text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_network text := lower(btrim(p_network));
  v_cfg public.reward_runtime_config%rowtype;
  v_total_count integer := 0;
  v_shadow_count integer := 0;
  v_live_count integer := 0;
  v_conservation_mismatch integer := 0;
  v_calculation_mismatch integer := 0;
  v_queue_mismatch integer := 0;
  v_source_mismatch integer := 0;
  v_window_mismatch integer := 0;
  v_policy_mismatch integer := 0;
  v_missing_projection integer := 0;
  v_reservation numeric(78,0) := 0;
  v_base numeric(78,0) := 0;
  v_promotion numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  with audited as (
    select
      s.*,
      q.id as queue_found_id,
      q.invite_code as queue_invite_code,
      q.network as queue_network,
      lower(q.recipient_wallet) as queue_recipient_wallet,
      q.reserved_amount_wei as queue_reserved_amount_wei,
      q.reserved_at as queue_reserved_at,
      i.invite_code as invitation_found_code,
      i.created_at as invitation_created_at,
      lower(i.inviter_wallet) as invitation_inviter_wallet,
      i.activation_network as invitation_network,
      i.reward_cohort_round_id as invitation_cohort_round_id,
      i.reward_funding_allocation_receipt_id as invitation_allocation_receipt_id,
      c.base_amount_wei as expected_base_amount_wei,
      c.promotion_amount_wei as expected_promotion_amount_wei,
      c.promotion_rate_bps as expected_promotion_rate_bps,
      c.promotion_cap_wei as expected_promotion_cap_wei
    from public.reward_x_promotion_splits s
    left join public.reward_queue_entries q
      on q.id=s.queue_entry_id
    left join public.invitations i
      on i.invite_code=s.invite_code
    cross join lateral public.calculate_reward_x_promotion_for_policy_v3(
      s.reservation_amount_wei,s.policy_version
    ) c
    where s.network=v_network
  )
  select
    count(*)::integer,
    count(*) filter (where mode='SHADOW')::integer,
    count(*) filter (where mode='LIVE')::integer,
    count(*) filter (
      where (policy_version='x-promotion-additive-v2' and base_amount_wei<>reservation_amount_wei)
        or (policy_version='x-promotion-withheld-10pct-v3' and base_amount_wei+promotion_amount_wei<>reservation_amount_wei)
    )::integer,
    count(*) filter (
      where base_amount_wei<>expected_base_amount_wei
         or promotion_amount_wei<>expected_promotion_amount_wei
         or promotion_rate_bps<>expected_promotion_rate_bps
         or promotion_cap_wei<>expected_promotion_cap_wei
    )::integer,
    count(*) filter (
      where queue_found_id is null
         or queue_invite_code<>invite_code
         or queue_network<>network
         or queue_recipient_wallet<>recipient_wallet
         or queue_reserved_amount_wei<>reservation_amount_wei
         or queue_reserved_at is null
    )::integer,
    count(*) filter (
      where invitation_found_code is null
         or invitation_inviter_wallet<>recipient_wallet
         or invitation_network<>network
         or invitation_cohort_round_id<>source_reward_cohort_round_id
         or invitation_allocation_receipt_id<>source_allocation_receipt_id
    )::integer,
    count(*) filter (
      where (
        mode='SHADOW'
        and (
          v_cfg.reward_x_promotion_shadow_started_at is null
          or queue_reserved_at is null
          or queue_reserved_at<v_cfg.reward_x_promotion_shadow_started_at
          or (
            v_cfg.reward_x_promotion_live_started_at is not null
            and queue_reserved_at>=v_cfg.reward_x_promotion_live_started_at
          )
        )
      )
      or (
        mode='LIVE'
        and (
          v_cfg.reward_x_promotion_live_started_at is null
          or queue_reserved_at is null
          or queue_reserved_at<v_cfg.reward_x_promotion_live_started_at
        )
      )
    )::integer,
    count(*) filter (
      where policy_version is distinct from
         (case when v_cfg.reward_x_promotion_v3_cutover_at is not null
                     and invitation_created_at>=v_cfg.reward_x_promotion_v3_cutover_at
                     and (v_cfg.reward_x_promotion_v3_sunset_at is null
                          or invitation_created_at<v_cfg.reward_x_promotion_v3_sunset_at)
               then 'x-promotion-withheld-10pct-v3'
               else 'x-promotion-additive-v2' end)
    )::integer,
    coalesce(sum(reservation_amount_wei),0),
    coalesce(sum(base_amount_wei),0),
    coalesce(sum(promotion_amount_wei),0)
  into
    v_total_count,
    v_shadow_count,
    v_live_count,
    v_conservation_mismatch,
    v_calculation_mismatch,
    v_queue_mismatch,
    v_source_mismatch,
    v_window_mismatch,
    v_policy_mismatch,
    v_reservation,
    v_base,
    v_promotion
  from audited;

  select count(*)::integer
  into v_missing_projection
  from public.reward_queue_entries q
  join public.invitations i
    on i.invite_code=q.invite_code
  where q.network=v_network
    and q.reserved_amount_wei is not null
    and q.reserved_amount_wei>0
    and q.reserved_at is not null
    and v_cfg.reward_x_promotion_shadow_started_at is not null
    and q.reserved_at>=v_cfg.reward_x_promotion_shadow_started_at
    and (
      v_cfg.reward_x_promotion_live_started_at is null
      or q.reserved_at<v_cfg.reward_x_promotion_live_started_at
    )
    and i.reward_cohort_round_id is not null
    and i.reward_funding_allocation_receipt_id is not null
    and not exists (
      select 1
      from public.reward_x_promotion_splits s
      where s.invite_code=q.invite_code
    );

  return jsonb_build_object(
    'ok',
      v_conservation_mismatch=0
      and v_calculation_mismatch=0
      and v_queue_mismatch=0
      and v_source_mismatch=0
      and v_window_mismatch=0
      and v_policy_mismatch=0
      and v_missing_projection=0,
    'network',v_network,
    'shadowEnabled',v_cfg.reward_x_promotion_shadow_enabled,
    'liveEnabled',v_cfg.reward_x_promotion_enabled,
    'policyVersion',v_cfg.reward_x_promotion_policy_version,
    'shadowStartedAt',v_cfg.reward_x_promotion_shadow_started_at,
    'liveStartedAt',v_cfg.reward_x_promotion_live_started_at,
    'totalCount',v_total_count,
    'shadowCount',v_shadow_count,
    'liveCount',v_live_count,
    'reservationWei',v_reservation::text,
    'baseWei',v_base::text,
    'promotionWei',v_promotion::text,
    'violations',jsonb_build_object(
      'conservation',v_conservation_mismatch,
      'calculation',v_calculation_mismatch,
      'queueBinding',v_queue_mismatch,
      'sourceBinding',v_source_mismatch,
      'activationWindow',v_window_mismatch,
      'policyVersion',v_policy_mismatch,
      'missingProjection',v_missing_projection
    )
  );
end;
$function$;
