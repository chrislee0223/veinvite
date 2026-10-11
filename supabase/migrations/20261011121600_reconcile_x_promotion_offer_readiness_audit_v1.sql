create or replace function public.read_reward_x_promotion_offer_readiness_v1(
  p_network text,
  p_min_shadow_samples integer default 5
)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_min_samples integer := greatest(1,least(coalesce(p_min_shadow_samples,5),1000));
  v_cfg public.reward_runtime_config%rowtype;
  v_shadow jsonb;
  v_shadow_ok boolean := false;
  v_shadow_count integer := 0;
  v_live_split_count integer := 0;
  v_live_obligation_count integer := 0;
  v_live_opportunity_count integer := 0;
  v_payout_artifact_count integer := 0;
  v_active_core_round_count integer := 0;
  v_ready boolean := false;
  v_blockers jsonb := '[]'::jsonb;
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

  v_shadow := public.read_reward_x_promotion_shadow_audit(v_network);
  v_shadow_ok := coalesce((v_shadow->>'ok')::boolean,false);
  v_shadow_count := greatest(coalesce((v_shadow->>'shadowCount')::integer,0),0);

  select count(*)::integer
  into v_live_split_count
  from public.reward_x_promotion_splits s
  where s.network=v_network
    and s.mode='LIVE';

  select count(*)::integer
  into v_live_obligation_count
  from public.reward_x_promotion_obligations o
  where o.network=v_network;

  select count(*)::integer
  into v_live_opportunity_count
  from public.reward_x_promotion_opportunities x
  where x.network=v_network;

  select
      (select count(*) from public.reward_x_promotion_payout_intents i where i.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_manifests m where m.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_signed_transactions s where s.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_submissions s where s.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_settlements s where s.network=v_network)
    + (select count(*) from public.reward_x_promotion_receipts r where r.network=v_network)
  into v_payout_artifact_count;

  select count(*)::integer
  into v_active_core_round_count
  from public.reward_rounds rr
  where rr.network=v_network
    and rr.app_id=v_veinvite_app_id
    and rr.status in ('CREATED','PAYING');

  select coalesce(jsonb_agg(v.reason) filter (where v.reason is not null),'[]'::jsonb)
  into v_blockers
  from (
    values
      (case when v_cfg.reward_x_promotion_enabled then 'LIVE_ALREADY_ENABLED' end),
      (case when v_cfg.reward_x_promotion_payout_enabled then 'PAYOUT_ALREADY_ENABLED' end),
      (case when not v_cfg.reward_x_promotion_shadow_enabled then 'SHADOW_DISABLED' end),
      (case when v_cfg.reward_x_promotion_shadow_started_at is null then 'SHADOW_START_MISSING' end),
      (case when v_cfg.reward_x_promotion_live_started_at is not null then 'LIVE_BOUNDARY_ALREADY_SET' end),
      (case when v_cfg.reward_x_promotion_policy_version<>'x-promotion-split-v1' then 'POLICY_UNSUPPORTED' end),
      (case when not v_shadow_ok then 'SHADOW_AUDIT_FAILED' end),
      (case when v_shadow_count<v_min_samples then 'INSUFFICIENT_SHADOW_SAMPLES' end),
      (case when v_live_split_count<>0 then 'UNEXPECTED_LIVE_SPLITS' end),
      (case when v_live_obligation_count<>0 then 'UNEXPECTED_LIVE_OBLIGATIONS' end),
      (case when v_live_opportunity_count<>0 then 'UNEXPECTED_LIVE_OPPORTUNITIES' end),
      (case when v_payout_artifact_count<>0 then 'UNEXPECTED_PAYOUT_ARTIFACTS' end),
      (case when v_active_core_round_count<>0 then 'CORE_REWARD_ROUND_ACTIVE' end)
  ) as v(reason);

  v_ready := jsonb_array_length(v_blockers)=0;

  return jsonb_build_object(
    'ready',v_ready,
    'network',v_network,
    'minimumShadowSamples',v_min_samples,
    'shadowSamples',v_shadow_count,
    'shadowAuditOk',v_shadow_ok,
    'liveEnabled',v_cfg.reward_x_promotion_enabled,
    'payoutEnabled',v_cfg.reward_x_promotion_payout_enabled,
    'shadowEnabled',v_cfg.reward_x_promotion_shadow_enabled,
    'shadowStartedAt',v_cfg.reward_x_promotion_shadow_started_at,
    'liveStartedAt',v_cfg.reward_x_promotion_live_started_at,
    'policyVersion',v_cfg.reward_x_promotion_policy_version,
    'unexpectedState',jsonb_build_object(
      'liveSplits',v_live_split_count,
      'liveObligations',v_live_obligation_count,
      'liveOpportunities',v_live_opportunity_count,
      'payoutArtifacts',v_payout_artifact_count,
      'activeCoreRewardRounds',v_active_core_round_count
    ),
    'blockers',v_blockers,
    'shadowAudit',v_shadow
  );
end;
$function$;

revoke all on function public.read_reward_x_promotion_offer_readiness_v1(text,integer)
  from public,anon,authenticated;
grant execute on function public.read_reward_x_promotion_offer_readiness_v1(text,integer)
  to service_role;
