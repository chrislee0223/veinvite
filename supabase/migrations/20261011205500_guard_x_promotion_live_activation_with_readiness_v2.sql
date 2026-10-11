create or replace function public.guard_reward_x_promotion_live_activation_interlock()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_ready jsonb;
  v_now timestamptz := clock_timestamp();
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
begin
  if old.reward_x_promotion_enabled=false
     and new.reward_x_promotion_enabled=true then
    -- Serialize the activation boundary with new reward reservations and
    -- cohort batch creation so no reservation can straddle the LIVE boundary.
    perform pg_advisory_xact_lock(
      hashtextextended('veinvite_reward_reservation_mainnet',0)
    );
    perform pg_advisory_xact_lock(
      hashtextextended(
        'veinvite_predictive_reward_mainnet_' || v_veinvite_app_id,
        0
      )
    );

    if new.reward_x_promotion_live_started_at is null then
      raise exception 'REWARD_X_PROMOTION_LIVE_START_MISSING';
    end if;

    if new.reward_x_promotion_policy_version<>'x-promotion-split-v1' then
      raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
    end if;

    if not new.reward_x_promotion_shadow_enabled then
      raise exception 'REWARD_X_PROMOTION_SHADOW_REQUIRED';
    end if;

    -- The immutable boundary must be created at activation time, not backdated
    -- or predated. This keeps grandfathering deterministic.
    if new.reward_x_promotion_live_started_at < v_now - interval '60 seconds'
       or new.reward_x_promotion_live_started_at > v_now + interval '10 seconds' then
      raise exception 'REWARD_X_PROMOTION_LIVE_START_NOT_FRESH';
    end if;

    v_ready :=
      public.read_reward_x_promotion_offer_readiness_v2('mainnet',5);

    if not coalesce((v_ready->>'ready')::boolean,false) then
      raise exception 'REWARD_X_PROMOTION_LIVE_ACTIVATION_NOT_READY';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_reward_x_promotion_live_activation_interlock()
  from public,anon,authenticated,service_role;

comment on function public.guard_reward_x_promotion_live_activation_interlock() is
  'Fail-closed Production LIVE activation guard. A false-to-true X promotion activation requires a fresh immutable LIVE boundary and current offer readiness v2 under the same reward reservation and cohort planning locks. This guard never activates LIVE by itself.';
