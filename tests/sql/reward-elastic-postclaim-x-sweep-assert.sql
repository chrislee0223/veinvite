\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 e numeric:=power(10::numeric,18);
BEGIN
 UPDATE reward_admission_bridge.elastic_settlement_settings
 SET enabled=true,allow_protected_partial_settlement=true,
     rollout_not_before=now()-interval '8 days' WHERE id=1;
 UPDATE public.invitations
 SET status='CANCELLED',sybil_status='BLOCKED',reward_status='FORFEITED'
 WHERE invite_code='ELASTIC-OLDUSER';
 -- Three fixed-base participants leave zero pending entries, but an X post
 -- can still arrive within 24 hours and be held for an additional 24h.
 INSERT INTO public.reward_queue_entries
 (invite_code,network,reserved_amount_wei,status) VALUES
 ('ELASTIC-USER1','mainnet',300*e,'ASSIGNED'),
 ('ELASTIC-USER2','mainnet',300*e,'ASSIGNED'),
 ('ELASTIC-UNFIN','mainnet',300*e,'ASSIGNED');
 INSERT INTO public.reward_payouts
 (invite_code,round_id,amount_wei,status,paid_at)
 VALUES('ELASTIC-USER1',11,300*e,'PAID',now()),
       ('ELASTIC-USER2',11,300*e,'PAID',now()),
       ('ELASTIC-UNFIN',11,300*e,'PAID',now());
 IF NOT public.reward_elastic_source_has_unsettled_slots_v1('mainnet',app,125,1003)
 THEN RAISE EXCEPTION 'Fresh post-Claim X right source budget was swept'; END IF;
 UPDATE public.reward_payouts SET paid_at=now()-interval '4 days'
 WHERE invite_code LIKE 'ELASTIC-%';
 IF public.reward_elastic_source_has_unsettled_slots_v1('mainnet',app,125,1003)
 THEN RAISE EXCEPTION 'Expired X right remains permanently locked'; END IF;
 INSERT INTO public.reward_x_promotion_obligations
 (id,split_id,invite_code,network,promotion_amount_wei,financial_state,
  source_reward_cohort_round_id,source_allocation_receipt_id)
 VALUES(99,1,'ELASTIC-USER1','mainnet',10*e,'HELD',125,1003);
 IF NOT public.reward_elastic_source_has_unsettled_slots_v1('mainnet',app,125,1003)
 THEN RAISE EXCEPTION 'LIVE HELD X obligation was swept'; END IF;
 UPDATE public.reward_x_promotion_obligations
 SET financial_state='RELEASED' WHERE id=99;
 IF public.reward_elastic_source_has_unsettled_slots_v1('mainnet',app,125,1003)
 THEN RAISE EXCEPTION 'Terminal X obligation did not unlock source'; END IF;
 INSERT INTO public.reward_x_promotion_post_submissions
 (invite_code,network,invalidated_at,submission_state)
 VALUES('ELASTIC-USER1','mainnet',NULL,'PENDING');
 IF NOT public.reward_elastic_source_has_unsettled_slots_v1('mainnet',app,125,1003)
 THEN RAISE EXCEPTION 'Active post verification lost source budget'; END IF;
 UPDATE public.reward_x_promotion_post_submissions
 SET invalidated_at=now() WHERE invite_code='ELASTIC-USER1';
 IF public.reward_elastic_source_has_unsettled_slots_v1('mainnet',app,125,1003)
 THEN RAISE EXCEPTION 'Invalidated post still locked source'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS SOURCE_SWEEP protects 72h X window, HELD obligation and active post' result;
