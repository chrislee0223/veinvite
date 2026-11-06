-- Disposable PG17 faithful projection of the real core physical guard.
-- Installed only AFTER all earlier fake reward-admission tests finish.
-- It is intentionally narrow: the Production function still performs all
-- identity, finality, Sybil, wallet, receipt and recovery checks separately.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION public.commit_reward_reservation(
  p_invite_code text,p_network text,p_observed_pool_balance_wei numeric,
  p_expected_reserved_before_wei numeric,p_amount_wei numeric,
  p_algorithm_version text,p_quote_snapshot_id bigint,
  p_finalized_block bigint,p_basis jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public
AS $stub$
DECLARE
  v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_invitation public.invitations%rowtype;
  v_reserved numeric(78,0) := 0;
  v_net numeric(78,0) := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'veinvite_reward_reservation_'||p_network,0));
  SELECT * INTO v_invitation FROM public.invitations
  WHERE invite_code=p_invite_code FOR UPDATE;
  IF NOT FOUND OR v_invitation.status<>'COMPLETED'
    OR v_invitation.sybil_status<>'CLEAR' THEN
    RETURN jsonb_build_object('reserved',false,'reason','NOT_ELIGIBLE');
  END IF;
  IF EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=p_invite_code)
  THEN RETURN jsonb_build_object('reserved',false,'reason','ALREADY_FIXED'); END IF;
  v_reserved:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
  IF v_reserved<>p_expected_reserved_before_wei THEN
    RETURN jsonb_build_object('reserved',false,'reason','RECALCULATE'); END IF;
  v_net:=p_amount_wei;
  -- This exact guard block MUST match the original real canonical writer:
  if v_net>greatest(p_observed_pool_balance_wei-v_reserved,0) then
    return jsonb_build_object(
      'reserved',false,
      'reason','RECALCULATE',
      'reservedExistingWei',v_reserved::text,
      'availableWei',greatest(p_observed_pool_balance_wei-v_reserved,0)::text
    );
  end if;
  INSERT INTO public.reward_queue_entries(
    invite_code,network,reserved_amount_wei,status)
  VALUES(p_invite_code,p_network,v_net,'AWAITING_CLAIM');
  RETURN jsonb_build_object('reserved',true,'reason','RESERVED',
    'amountWei',v_net::text);
END $stub$;
