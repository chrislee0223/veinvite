-- Disposable PG17: verify the LIVE global reserve is eventually released,
-- without ever releasing a legitimate unfinished Claim or prospective X.
-- All fake financial writes happen inside one rolled-back transaction.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
  v_e numeric:=power(10::numeric,18);
  v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_before numeric;
  v_hold numeric;
BEGIN
 UPDATE reward_admission_bridge.elastic_settlement_settings
   SET enabled=true,allow_protected_partial_settlement=true,
       rollout_not_before=now()-interval '8 days' WHERE id=1;
 -- A historical pre-rollout invite does not join this new pricing group.
 UPDATE public.invitations SET status='CANCELLED',sybil_status='BLOCKED',
   reward_status='FORFEITED' WHERE invite_code='ELASTIC-OLDUSER';
 SELECT public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)
 INTO v_hold;
 IF v_hold<>1000*v_e THEN
   RAISE EXCEPTION 'Open invitations lost 1000 B3TR collateral: %',v_hold/v_e;
 END IF;
 SELECT public.read_outstanding_reward_liability('mainnet',v_app)::numeric
 INTO v_before;

 -- First verified inviter Claim, two prospective participants unchanged.
 INSERT INTO public.reward_queue_entries
  (invite_code,network,reserved_amount_wei,status)
 VALUES('ELASTIC-USER1','mainnet',300*v_e,'AWAITING_CLAIM');
 SELECT public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)
 INTO v_hold;
 IF v_hold<>700*v_e THEN
   RAISE EXCEPTION 'A queued Claim failed to convert contingent into base: %',v_hold/v_e;
 END IF;
 IF public.read_outstanding_reward_liability('mainnet',v_app)::numeric<>v_before THEN
   RAISE EXCEPTION 'Base reservation double-charged physical pool';
 END IF;

 -- All three eventually finish, with on-chain payout finality confirmed.
 INSERT INTO public.reward_queue_entries
 (invite_code,network,reserved_amount_wei,status) VALUES
 ('ELASTIC-USER2','mainnet',300*v_e,'ASSIGNED'),
 ('ELASTIC-UNFIN','mainnet',300*v_e,'ASSIGNED');
 UPDATE public.reward_queue_entries
 SET status='ASSIGNED' WHERE invite_code='ELASTIC-USER1';
 INSERT INTO public.reward_payouts
 (invite_code,round_id,status,amount_wei,paid_at)
 VALUES
 ('ELASTIC-USER1',11,'PAID',300*v_e,now()),
 ('ELASTIC-USER2',11,'PAID',300*v_e,now()),
 ('ELASTIC-UNFIN',11,'PAID',300*v_e,now());
 -- A just-paid winner still has 24h to post and 24h to retain X.
 SELECT public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)
 INTO v_hold;
 IF v_hold<>100*v_e THEN
   RAISE EXCEPTION 'Prospective X right lost before 72h safety window: %',v_hold/v_e;
 END IF;
 IF NOT public.reward_elastic_source_has_unsettled_slots_v1(
   'mainnet',v_app,125,1003) THEN
   RAISE EXCEPTION 'X opportunity unexpectedly unprotected by source sweeper';
 END IF;

 -- Fully PAID, past the X window, no active X posts or obligations:
 -- only now should the leftover 100 B3TR become available again.
 UPDATE public.reward_payouts SET paid_at=now()-interval '4 days'
 WHERE invite_code IN ('ELASTIC-USER1','ELASTIC-USER2','ELASTIC-UNFIN');
 IF public.reward_elastic_source_has_unsettled_slots_v1(
   'mainnet',v_app,125,1003) THEN
   RAISE EXCEPTION 'Terminal sources unexpectedly still marked active';
 END IF;
 SELECT public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)
 INTO v_hold;
 IF v_hold<>0 THEN
   RAISE EXCEPTION 'Terminal cohort locked unused physical pool indefinitely: %',v_hold/v_e;
 END IF;
 IF public.read_outstanding_reward_liability('mainnet',v_app)::numeric<>
    v_before-1000*v_e THEN
   RAISE EXCEPTION 'Global reward pool stayed locked after PAID and X expiry';
 END IF;

 -- Active X proof re-locks the leftover contingent amount, even 4d after
 -- payout, until verification resolves; future X cannot be swept prematurely.
 INSERT INTO public.reward_x_promotion_post_submissions
  (invite_code,network,invalidated_at,submission_state)
 VALUES('ELASTIC-USER1','mainnet',null,'PENDING');
 SELECT public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)
 INTO v_hold;
 IF v_hold<>100*v_e THEN
   RAISE EXCEPTION 'Active X proof did not preserve residual collateral: %',v_hold/v_e;
 END IF;
 UPDATE public.reward_x_promotion_post_submissions
 SET invalidated_at=now()
 WHERE invite_code='ELASTIC-USER1';
 SELECT public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)
 INTO v_hold;
 IF v_hold<>0 THEN
   RAISE EXCEPTION 'Invalidated X proof failed to release the remaining collateral';
 END IF;
END $test$;
ROLLBACK;
SELECT 'PASS pending / Claim / 72h X / terminal release / resumed X proof / rollback' result;
