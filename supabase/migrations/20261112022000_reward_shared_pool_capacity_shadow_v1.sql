-- Shared reward pool cutover, stage 1: READ-ONLY financial shadow.
-- This is NOT a payout authority. Legacy round budgets and all current
-- reservation, Claim, X, Sybil and transfer functions remain unchanged.
-- The on-chain application reward pool is already the 80% user allocation:
-- never subtract the operating 20% again, nor count swept virtual balances
-- as additional tokens in the physical pool.
CREATE OR REPLACE FUNCTION public.read_reward_shared_pool_capacity_shadow_v1(
  p_network text,
  p_app_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $shared_pool_shadow$
DECLARE
  v_app CONSTANT text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_forecast public.reward_forecast_snapshots%rowtype;
  v_settings reward_admission_bridge.elastic_settlement_settings%rowtype;
  v_total_outstanding numeric(78,0);
  v_uncommitted_provisional numeric(78,0);
  v_fixed_outstanding numeric(78,0);
  v_pool numeric(78,0);
  v_capacity numeric(78,0);
  v_x_per_winner numeric(78,0);
  v_one numeric(78,0);
  v_two numeric(78,0);
  v_three numeric(78,0);
BEGIN
  p_network := lower(btrim(coalesce(p_network,'')));
  p_app_id := lower(btrim(coalesce(p_app_id,'')));
  IF p_network NOT IN ('mainnet','testnet','testnet-staging')
     OR p_app_id<>v_app THEN
    RAISE EXCEPTION 'SHARED_POOL_SHADOW_INVALID_SCOPE';
  END IF;

  SELECT * INTO v_forecast
  FROM public.reward_forecast_snapshots f
  WHERE f.network=p_network AND f.app_id=v_app
  ORDER BY f.generated_at DESC,f.id DESC LIMIT 1;

  IF NOT FOUND OR v_forecast.generated_at IS NULL
     OR v_forecast.generated_at < clock_timestamp()-interval '75 minutes'
     OR v_forecast.generated_at > clock_timestamp()+interval '2 minutes' THEN
    RETURN jsonb_build_object(
      'mode','PENDING','reason','FRESH_ONCHAIN_SNAPSHOT_REQUIRED',
      'writesPerformed',false);
  END IF;

  SELECT * INTO v_settings
  FROM reward_admission_bridge.elastic_settlement_settings
  WHERE id=1;
  IF NOT FOUND OR v_settings.x_option_reserve_wei IS NULL
     OR v_settings.x_option_reserve_wei<0 THEN
    RAISE EXCEPTION 'SHARED_POOL_SHADOW_X_POLICY_MISSING';
  END IF;

  v_pool := v_forecast.observed_pool_balance_wei;
  v_total_outstanding :=
    public.read_outstanding_reward_liability(p_network,v_app)::numeric;
  v_uncommitted_provisional :=
    public.read_reward_elastic_contingent_liability_wei_v1(p_network,v_app);
  IF v_pool < 0 OR v_total_outstanding < 0
     OR v_uncommitted_provisional < 0
     OR v_uncommitted_provisional > v_total_outstanding THEN
    RAISE EXCEPTION 'SHARED_POOL_SHADOW_ACCOUNTING_INCONSISTENT';
  END IF;

  -- Only existing confirmed unpaid reservations and LIVE X obligations
  -- remain unavailable. An uncompleted user's provisional cohort budget is
  -- NOT a payment obligation. Older source stress and virtual reserve-bank
  -- balances are NOT separately deducted; they remain historical audit data.
  -- This subtraction is done ONCE: a provisional cohort amount may also
  -- occur inside v_total_outstanding, so subtract it from that reader first.
  v_fixed_outstanding :=
    v_total_outstanding-v_uncommitted_provisional;
  v_capacity := greatest(v_pool-v_fixed_outstanding,0);
  v_x_per_winner := v_settings.x_option_reserve_wei;

  v_one := greatest(v_capacity-v_x_per_winner,0);
  v_two := floor(greatest(v_capacity-2*v_x_per_winner,0)/2);
  v_three := floor(greatest(v_capacity-3*v_x_per_winner,0)/3);

  RETURN jsonb_build_object(
    'mode','SHADOW_ONLY','writesPerformed',false,
    'observedAt',v_forecast.generated_at,
    'poolWei',v_pool::text,
    'fixedOutstandingWei',v_fixed_outstanding::text,
    'discardedProvisionalCohortWei',v_uncommitted_provisional::text,
    'capacityBeforeNewXWei',v_capacity::text,
    'xOptionReservePerWinnerWei',v_x_per_winner::text,
    'oneWinnerWei',v_one::text,
    'twoWinnersWei',v_two::text,
    'threeWinnersWei',v_three::text,
    'isPayoutQuote',false,
    'requiresAtomicWriterCutover',true);
END;
$shared_pool_shadow$;

-- Operational shadow reader only; no public/anonymous RPC access.
REVOKE ALL ON FUNCTION public.read_reward_shared_pool_capacity_shadow_v1(text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_shared_pool_capacity_shadow_v1(text,text)
  TO service_role;
