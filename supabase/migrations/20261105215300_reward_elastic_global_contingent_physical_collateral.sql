-- Conservative universal physical collateral for every prospective, post-
-- rollout elastic cohort. Staged: EXACT ZERO until partial settlement opted in.
-- Covers mainnet base, Claim, X and future cross-cohort signers through the
-- single existing outstanding-liability reader (not a second signer).
BEGIN;
CREATE OR REPLACE FUNCTION public.read_reward_elastic_contingent_scope_liability_wei_v1(
 p_network text,p_app_id text,p_target_cohort bigint,p_target_receipt bigint
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $fn$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_cohort record;
 v_unbound bigint;
 v_budget numeric(78,0);
 v_active_committed numeric(78,0);
 v_finalized_paid_not_in_queue numeric(78,0);
 v_unspent numeric(78,0);
 v_total numeric(78,0):=0;
BEGIN
 p_network:=lower(btrim(coalesce(p_network,'')));
 p_app_id:=lower(btrim(coalesce(p_app_id,'')));
 IF p_network NOT IN ('mainnet','testnet','testnet-staging') OR p_app_id<>v_app
 THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_INVALID_SCOPE'; END IF;
 IF (p_target_cohort IS NULL) <> (p_target_receipt IS NULL) THEN
   RAISE EXCEPTION 'ELASTIC_CONTINGENT_TARGET_INCOMPLETE';
 END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled OR NOT v_cfg.allow_protected_partial_settlement
 THEN RETURN 0; END IF;
 IF v_cfg.rollout_not_before IS NULL THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_NO_EPOCH'; END IF;
 -- Unbound accepted invitations cannot safely reserve a cohort yet. Fail
 -- CLOSED: even unrelated rewards must not spend unknown new liabilities.
 SELECT count(*) INTO v_unbound FROM public.invitations i
 WHERE i.activation_network=p_network AND i.activated_at>=v_cfg.rollout_not_before
   AND i.status<>'CANCELLED'
   AND (i.reward_cohort_round_id IS NULL
        OR i.reward_funding_allocation_receipt_id IS NULL);
 IF v_unbound>0 THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_UNBOUND_INVITATIONS'; END IF;
 FOR v_cohort IN
   SELECT DISTINCT i.reward_cohort_round_id AS round_id,
     i.reward_funding_allocation_receipt_id AS receipt_id
   FROM public.invitations i
   WHERE i.activation_network=p_network
     AND i.activated_at>=v_cfg.rollout_not_before
     AND i.status<>'CANCELLED'
     AND (p_target_cohort IS NULL OR
       (i.reward_cohort_round_id=p_target_cohort
        AND i.reward_funding_allocation_receipt_id=p_target_receipt))
 LOOP
   v_budget:=public.read_reward_cohort_effective_budget_wei(
     p_network,v_app,v_cohort.round_id,v_cohort.receipt_id);
   v_active_committed:=public.read_reward_cohort_committed_wei(
     p_network,v_app,v_cohort.round_id,v_cohort.receipt_id);
   -- A PAID payout without an active queue no longer occupies a pending
   -- on-chain liability but DID consume this cohort's historical budget.
   SELECT coalesce(sum(p.amount_wei),0) INTO v_finalized_paid_not_in_queue
   FROM public.reward_payouts p
   JOIN public.invitations i ON i.invite_code=p.invite_code
   JOIN public.reward_rounds r ON r.id=p.round_id
   WHERE r.network=p_network AND r.app_id=v_app AND p.status='PAID'
     AND i.reward_cohort_round_id=v_cohort.round_id
     AND i.reward_funding_allocation_receipt_id=v_cohort.receipt_id
     AND NOT EXISTS (
       SELECT 1 FROM public.reward_queue_entries q
       WHERE q.invite_code=p.invite_code
         AND q.network=p_network
         AND q.reserved_amount_wei IS NOT NULL
         AND q.status IN ('AWAITING_CLAIM','QUEUED','ASSIGNED'));
   IF v_budget<0 OR v_active_committed<0 OR v_finalized_paid_not_in_queue<0
      OR v_budget<v_active_committed+v_finalized_paid_not_in_queue
   THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_BUDGET_INCONSISTENT'; END IF;
   v_unspent:=v_budget-v_active_committed-v_finalized_paid_not_in_queue;
   v_total:=v_total+v_unspent;
 END LOOP;
 IF v_total<0 OR v_total<>trunc(v_total) THEN
   RAISE EXCEPTION 'ELASTIC_CONTINGENT_ACCOUNTING_INVALID';
 END IF;
 RETURN v_total;
END $fn$;
REVOKE ALL ON FUNCTION public.read_reward_elastic_contingent_scope_liability_wei_v1(
 text,text,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_elastic_contingent_scope_liability_wei_v1(
 text,text,bigint,bigint) TO service_role;

-- Two-argument universal API intentionally delegates to the very same
-- calculator used to subtract the paying cohort's already-encumbered money.
CREATE OR REPLACE FUNCTION public.read_reward_elastic_contingent_liability_wei_v1(
 p_network text,p_app_id text) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public
AS $fn$
 SELECT public.read_reward_elastic_contingent_scope_liability_wei_v1(
   p_network,p_app_id,NULL::bigint,NULL::bigint);
$fn$;
REVOKE ALL ON FUNCTION public.read_reward_elastic_contingent_liability_wei_v1(
 text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_elastic_contingent_liability_wei_v1(
 text,text) TO service_role;

-- The same physical reserve reader is called by base reward, X payout and
-- unrelated cohort writers. This merely adds a computed encumbrance; it
-- cannot create an actual Claim or transfer.
DO $patch$
DECLARE
 s text;
 old_decl text := '  v_early_held numeric(78,0) := 0;';
 new_decl text := $d$
  v_early_held numeric(78,0) := 0;
  v_elastic_contingent numeric(78,0) := 0;$d$;
 old_return text := $r$
  return (
    v_early_held +
    v_reserved_existing +$r$;
 new_return text := $n$
  -- Before the first partially settled winner, ring-fence ALL uncommitted
  -- cohort funds, including prospective X options and unfinished claimants.
  -- This is deliberately more restrictive than the current payout estimate.
  v_elastic_contingent :=
    public.read_reward_elastic_contingent_liability_wei_v1(v_network,v_app_id);
  return (
    v_elastic_contingent +
    v_early_held +
    v_reserved_existing +$n$;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO s
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='read_outstanding_reward_liability';
 IF s IS NULL OR strpos(s,old_decl)=0 OR strpos(s,old_return)=0
   OR strpos(s,'v_elastic_contingent')>0
 THEN RAISE EXCEPTION 'ELASTIC_GLOBAL_PHYSICAL_READER_SOURCE_DRIFT'; END IF;
 EXECUTE replace(replace(s,old_decl,new_decl),old_return,new_return);
END $patch$;
COMMIT;