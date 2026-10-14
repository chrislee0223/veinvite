alter table public.reward_runtime_config
  drop constraint if exists reward_runtime_config_x_promotion_external_requires_payout_check,
  add constraint reward_runtime_config_x_promotion_external_requires_payout_check
    check (
      not reward_x_promotion_external_verification_ready
      or reward_x_promotion_payout_enabled
    );

create or replace function public.guard_reward_x_promotion_external_verification_readiness_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_runtime jsonb;
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
begin
  if new.reward_x_promotion_external_verification_ready
       is not distinct from old.reward_x_promotion_external_verification_ready
     and new.reward_x_promotion_external_verification_started_at
       is not distinct from old.reward_x_promotion_external_verification_started_at then
    return new;
  end if;

  if old.reward_x_promotion_external_verification_ready=false
     and new.reward_x_promotion_external_verification_ready=true then
    perform pg_advisory_xact_lock(
      hashtextextended('veinvite_reward_reservation_mainnet',0)
    );
    perform pg_advisory_xact_lock(
      hashtextextended(
        'veinvite_predictive_reward_mainnet_' || v_veinvite_app_id,
        0
      )
    );

    if not new.reward_x_promotion_enabled
       or new.reward_x_promotion_live_started_at is null then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_REQUIRES_LIVE';
    end if;

    if not new.reward_x_promotion_payout_enabled then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_REQUIRES_PAYOUT';
    end if;

    if new.reward_x_promotion_policy_version<>'x-promotion-split-v1' then
      raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
    end if;

    if new.reward_x_promotion_external_verification_started_at is null then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_START_MISSING';
    end if;

    if new.reward_x_promotion_external_verification_started_at < v_now - interval '60 seconds'
       or new.reward_x_promotion_external_verification_started_at > v_now + interval '10 seconds' then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_START_NOT_FRESH';
    end if;

    v_runtime :=
      public.read_reward_x_promotion_external_runtime_readiness_v1(
        'mainnet',
        1200
      );

    if not coalesce((v_runtime->>'ready')::boolean,false) then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_RUNTIME_NOT_READY';
    end if;

    return new;
  end if;

  if old.reward_x_promotion_external_verification_ready=true
     and new.reward_x_promotion_external_verification_ready=false then
    if new.reward_x_promotion_external_verification_started_at
         is distinct from old.reward_x_promotion_external_verification_started_at then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_PAUSE_BOUNDARY_MUTATION';
    end if;
    return new;
  end if;

  raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_BOUNDARY_INVALID';
end;
$function$;

revoke all on function public.guard_reward_x_promotion_external_verification_readiness_v1()
  from public,anon,authenticated,service_role;

comment on constraint reward_runtime_config_x_promotion_external_requires_payout_check
  on public.reward_runtime_config is
  'New X promotion offers may become externally verifiable only while the promotion payout signer is enabled. To pause payouts, pause external verification/new offers first.';

comment on function public.guard_reward_x_promotion_external_verification_readiness_v1() is
  'Fail-closed activation guard: new externally verifiable X promotion offers require LIVE, payout signing readiness, a fresh external boundary, and a fresh successful X API runtime probe.';
