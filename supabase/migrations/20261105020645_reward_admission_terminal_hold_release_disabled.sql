-- Staged invalid-referral HELD release for an already funded admission.
-- No permission to create claims, change payouts, or alter admission policy.
-- Hard-disabled while reward_admission_bridge.settings has CHECK(enabled=false).
BEGIN;
CREATE OR REPLACE FUNCTION public.release_terminal_reward_admission_held_v1(
 p_network text,p_limit integer DEFAULT 25
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $release$
DECLARE
 v_net text:=lower(btrim(coalesce(p_network,'')));
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_enabled boolean;
 v_limit integer;
 v_code text;
 v_inv public.invitations%rowtype;
 v_hold reward_admission_bridge.holds%rowtype;
 v_before_physical numeric(78,0);
 v_before_cohort numeric(78,0);
 v_released_count integer:=0;
 v_skipped_fixed integer:=0;
 v_released_wei numeric(78,0):=0;
BEGIN
 IF v_net NOT IN ('mainnet','testnet','testnet-staging') OR
   p_limit IS NULL OR p_limit<1 OR p_limit>50
 THEN RAISE EXCEPTION 'INVALID_ADMISSION_RELEASE_BATCH_INPUT'; END IF;
 v_limit:=p_limit;
 SELECT enabled INTO v_enabled FROM reward_admission_bridge.settings WHERE id=1;
 IF NOT FOUND OR v_enabled IS DISTINCT FROM true THEN
   RETURN jsonb_build_object('released',0,'releasedWei','0',
      'reason','ADMISSION_RELEASE_DISABLED');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||v_net,0));
 FOR v_code IN
   SELECT h.invite_code
   FROM reward_admission_bridge.holds h
   JOIN public.invitations i ON i.invite_code=h.invite_code
   WHERE h.network=v_net AND h.status='HELD'
     AND (i.status='CANCELLED' OR i.sybil_status='BLOCKED')
   ORDER BY h.created_at,h.invite_code
   LIMIT v_limit
 LOOP
   SELECT * INTO v_inv FROM public.invitations
     WHERE invite_code=v_code AND activation_network=v_net FOR UPDATE;
   IF NOT FOUND OR (v_inv.status<>'CANCELLED' AND v_inv.sybil_status<>'BLOCKED')
   THEN CONTINUE; END IF;
   SELECT * INTO v_hold FROM reward_admission_bridge.holds
     WHERE network=v_net AND invite_code=v_code FOR UPDATE;
   IF NOT FOUND OR v_hold.status<>'HELD' THEN CONTINUE; END IF;
   IF v_hold.app_id<>v_app OR
      v_hold.reward_cohort_round_id IS DISTINCT FROM v_inv.reward_cohort_round_id OR
      v_hold.funding_allocation_receipt_id
        IS DISTINCT FROM v_inv.reward_funding_allocation_receipt_id
   THEN RAISE EXCEPTION 'ADMISSION_RELEASE_IDENTITY_DRIFT'; END IF;
   IF EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=v_code)
      OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements r
                WHERE r.network=v_net AND r.invite_code=v_code)
      OR EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=v_code)
   THEN
      v_skipped_fixed:=v_skipped_fixed+1;
      CONTINUE;
   END IF;
   v_before_physical:=public.read_outstanding_reward_liability(v_net,v_app)::numeric;
   v_before_cohort:=public.read_reward_cohort_committed_wei(
      v_net,v_app,v_hold.reward_cohort_round_id,
      v_hold.funding_allocation_receipt_id);
   UPDATE reward_admission_bridge.holds SET status='RELEASED'
     WHERE network=v_net AND invite_code=v_code AND status='HELD';
   IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_RELEASE_ROW_RACE'; END IF;
   IF public.read_outstanding_reward_liability(v_net,v_app)::numeric
         <>v_before_physical-v_hold.amount_wei
      OR public.read_reward_cohort_committed_wei(
          v_net,v_app,v_hold.reward_cohort_round_id,
          v_hold.funding_allocation_receipt_id)
         <>v_before_cohort-v_hold.amount_wei
   THEN RAISE EXCEPTION 'ADMISSION_RELEASE_LEDGER_DRIFT'; END IF;
   v_released_count:=v_released_count+1;
   v_released_wei:=v_released_wei+v_hold.amount_wei;
 END LOOP;
 RETURN jsonb_build_object(
   'released',v_released_count,
   'releasedWei',v_released_wei::text,
   'skippedFixed',v_skipped_fixed,
   'reason','TERMINAL_HELD_SWEEP_COMPLETE');
END $release$;
REVOKE ALL ON FUNCTION public.release_terminal_reward_admission_held_v1(text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_terminal_reward_admission_held_v1(text,integer)
 TO service_role;
COMMIT;
