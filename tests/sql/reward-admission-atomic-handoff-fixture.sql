-- All data below is FAKE. Executed only in isolated GitHub PostgreSQL 17.
-- The live source functions are captured in canonical-reader-fixture and
-- upgraded via the already-deployed HELD-aware migration before these stubs.
\set ON_ERROR_STOP on
ALTER TABLE public.invitations
 ADD COLUMN activation_network text NOT NULL DEFAULT 'mainnet',
 ADD COLUMN status text NOT NULL DEFAULT 'COMPLETED',
 ADD COLUMN sybil_status text NOT NULL DEFAULT 'CLEAR',
 ADD COLUMN mock_recovery_offset_wei numeric(78,0) NOT NULL DEFAULT 0;
ALTER TABLE public.reward_recovery_settlements
 ADD COLUMN gross_amount_wei numeric(78,0) NOT NULL DEFAULT 0,
 ADD COLUMN net_amount_wei numeric(78,0) NOT NULL DEFAULT 0;

-- FAKE analog of the legacy core reservation + recovery writer.
-- Does not purport to simulate identity/Sybil evidence, finality, or wallet
-- custody; those must be verified by the actual Production core separately.
CREATE FUNCTION public.commit_reward_reservation_with_late_reserve(
  p_invite_code text,p_network text,p_observed_pool_balance_wei numeric,
  p_expected_reserved_before_wei numeric,p_amount_wei numeric,
  p_algorithm_version text,p_quote_snapshot_id bigint,
  p_finalized_block bigint,p_basis jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO pg_catalog,public
AS $stub$
DECLARE
  v_inv public.invitations%rowtype;
  v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_pre numeric(78,0);
  v_committed numeric(78,0);
  v_budget numeric(78,0);
  v_offset numeric(78,0);
  v_net numeric(78,0);
BEGIN
  SELECT * INTO v_inv FROM public.invitations i
  WHERE i.invite_code=p_invite_code AND i.activation_network=p_network FOR UPDATE;
  IF NOT FOUND OR v_inv.status<>'COMPLETED' OR v_inv.sybil_status<>'CLEAR' THEN
    RETURN jsonb_build_object('reserved',false,'reason','SYBIL_OR_COMPLETION_PENDING');
  END IF;
  IF EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=p_invite_code)
    OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements s
       WHERE s.invite_code=p_invite_code)
  THEN RETURN jsonb_build_object('reserved',true,'reason','ALREADY_RESERVED','amountWei','0'); END IF;
  v_pre:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
  v_committed:=public.read_reward_cohort_committed_wei(
    p_network,v_app,v_inv.reward_cohort_round_id,v_inv.reward_funding_allocation_receipt_id);
  v_budget:=public.read_reward_cohort_effective_budget_wei(
    p_network,v_app,v_inv.reward_cohort_round_id,v_inv.reward_funding_allocation_receipt_id);
  IF v_pre<>p_expected_reserved_before_wei
     OR v_committed<>(p_basis->>'cohortReservedWei')::numeric
  THEN RETURN jsonb_build_object('reserved',false,'reason','RECALCULATE'); END IF;
  v_offset:=least(p_amount_wei,v_inv.mock_recovery_offset_wei);
  v_net:=p_amount_wei-v_offset;
  IF v_committed+p_amount_wei>v_budget OR v_pre+v_net>p_observed_pool_balance_wei
  THEN RETURN jsonb_build_object('reserved',false,'reason','UNDERFUNDED'); END IF;
  IF v_offset>0 THEN
    INSERT INTO public.reward_recovery_settlements(
      id,invite_code,network,offset_amount_wei,gross_amount_wei,net_amount_wei)
    VALUES (3000+(SELECT count(*) FROM public.reward_recovery_settlements),
      p_invite_code,p_network,v_offset,p_amount_wei,v_net);
  END IF;
  IF v_net>0 THEN
    INSERT INTO public.reward_queue_entries(invite_code,network,reserved_amount_wei,status)
    VALUES(p_invite_code,p_network,v_net,'AWAITING_CLAIM');
  END IF;
  RETURN jsonb_build_object('reserved',true,'reason',
      CASE WHEN v_offset=p_amount_wei THEN 'RECOVERY_FULLY_SETTLED'
      WHEN v_offset>0 THEN 'RECOVERY_PARTIAL_RESERVED'
      ELSE 'RESERVED' END,
      'amountWei',v_net::text);
END $stub$;

-- Test-only admission rows. Do NOT remove settings_enabled_check in Production.
-- Allow enabled=true only in the disposable PostgreSQL CI fixture.
ALTER TABLE reward_admission_bridge.settings
  DROP CONSTRAINT settings_enabled_check;
