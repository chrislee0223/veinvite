\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('veinvite.qa_legacy', :'legacy', false);
UPDATE public.invitations SET created_at=now()-interval '60 days'
 WHERE invite_code='EDFW4Y7' AND current_setting('veinvite.qa_legacy')='1';
-- Isolated synthetic pool: 100 B3TR, 1 current retry, 90 base + 10 withheld X.
-- No real token transaction or external signer is called.
DO $financial$
DECLARE
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 e numeric:=1000000000000000000; r jsonb; q public.reward_queue_entries%rowtype;
 gross numeric; legacy boolean:=current_setting('veinvite.qa_legacy')='1';
 sp public.reward_x_promotion_splits%rowtype; o public.reward_x_promotion_obligations%rowtype;
 receipt bigint; wallet text; claimrow record; rid bigint; pid bigint; paidtime timestamptz; tx text:='0x'||repeat('a',64);
BEGIN
 gross:=CASE WHEN legacy THEN 90*e ELSE 100*e END;
 SELECT inviter_wallet INTO wallet FROM public.invitations WHERE invite_code='EDFW4Y7';
 SELECT id INTO receipt FROM public.vebetter_round_allocations WHERE network='mainnet' AND vebetter_round_id=128;
 UPDATE reward_admission_bridge.mission_auto_reset_settings_v1 SET enabled=true WHERE id=1;
 -- First verify the existing canonical clearance, no fake clearance insertion.
 SELECT public.issue_sybil_v2_reward_clearance('EDFW4Y7',5) INTO r;
 IF r->>'issued'<>'true' OR r->>'verdict'<>'CLEAR' THEN RAISE EXCEPTION 'Clearance failed: %',r; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.read_reward_vote_round_candidates_v1('mainnet',129)
   WHERE invite_code='EDFW4Y7' AND reward_cohort_round_id=129 AND reward_funding_allocation_receipt_id=receipt AND completion_block=4001)
 THEN RAISE EXCEPTION 'Canonical vote-round candidate missing'; END IF;
 SELECT public.commit_reward_vote_round_close_batch_v1('EDFW4Y7','mainnet',100*e,clock_timestamp(),4900) INTO r;
 IF r->>'reason'<>'WAIT_FOR_ROUND_CLOSE_FINALITY' THEN RAISE EXCEPTION 'Reserved before close finality: %',r; END IF;
 UPDATE public.vote_reconcile_scan_checkpoints SET last_scanned_block=4900 WHERE network='mainnet';
 SELECT public.commit_reward_vote_round_close_batch_v1('EDFW4Y7','mainnet',100*e,clock_timestamp(),5200) INTO r;
 IF r->>'reason'<>'WAIT_FOR_VOTE_SCAN_CATCHUP' THEN RAISE EXCEPTION 'Reserved before indexer catchup: %',r; END IF;
 UPDATE public.vote_reconcile_scan_checkpoints SET last_scanned_block=5200 WHERE network='mainnet';
 SELECT public.commit_reward_vote_round_close_batch_v1('EDFW4Y7','mainnet',100*e,clock_timestamp(),5200) INTO r;
 IF r->>'mode'<>'ROUND_BATCH_RESERVED' OR r->>'count'<>'1' THEN RAISE EXCEPTION 'Real batch reserve failed: %',r; END IF;
 SELECT * INTO q FROM public.reward_queue_entries WHERE invite_code='EDFW4Y7';
 SELECT * INTO sp FROM public.reward_x_promotion_splits WHERE invite_code='EDFW4Y7';
 SELECT * INTO o FROM public.reward_x_promotion_obligations WHERE invite_code='EDFW4Y7';
 IF q.reserved_amount_wei IS DISTINCT FROM gross OR q.status<>'AWAITING_CLAIM'
   OR q.reservation_completion_block<>4001 OR q.reservation_basis->>'rewardCohortRoundId'<>'129'
   OR sp.source_reward_cohort_round_id<>129 OR sp.source_allocation_receipt_id<>receipt
   OR sp.base_amount_wei IS DISTINCT FROM 90*e OR o.promotion_amount_wei IS DISTINCT FROM 10*e
   OR o.financial_state<>'RESERVED'
 THEN RAISE EXCEPTION 'Wrong queue, funding or X split'; END IF;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>100*e
  OR public.read_reward_cohort_committed_wei('mainnet',app,129,receipt)<>100*e
 THEN RAISE EXCEPTION 'Incorrect fixed liability or double-counted X'; END IF;
 SELECT public.commit_reward_vote_round_close_batch_v1('EDFW4Y7','mainnet',100*e,clock_timestamp(),5200) INTO r;
 IF r->>'mode'<>'ALREADY_RESERVED' OR (SELECT count(*) FROM public.reward_queue_entries WHERE invite_code='EDFW4Y7')<>1 THEN RAISE EXCEPTION 'Double batch reservation: %',r; END IF;
 SELECT * INTO claimrow FROM public.request_reward_claim('EDFW4Y7',wallet);
 IF claimrow.status<>'QUEUED' OR public.read_reward_batch_transfer_amount_wei_v1('EDFW4Y7')<>90*e
 THEN RAISE EXCEPTION 'Canonical Claim or net base transfer failed'; END IF;
 INSERT INTO public.reward_rounds(network,app_id,vebetter_round_id,allocation_receipt_id,allocation_rewards_wei,opening_carryover_wei)
 VALUES('mainnet',app,130,receipt,100*e,0) RETURNING id INTO rid;
 UPDATE public.reward_queue_entries SET status='ASSIGNED',assigned_round_id=rid,assigned_at=clock_timestamp() WHERE invite_code='EDFW4Y7';
 -- Payout amount must equal immutable base, not gross (the X share is separate).
 BEGIN
   INSERT INTO public.reward_payouts(invite_code,round_id,recipient_wallet,amount_wei,status)
   VALUES('EDFW4Y7',rid,wallet,100*e,'PENDING');
   RAISE EXCEPTION 'GROSS_PAYOUT_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'REWARD_PAYOUT_X_PROMOTION_AMOUNT_MISMATCH' THEN RAISE; END IF;
 END;
 INSERT INTO public.reward_payouts(invite_code,round_id,recipient_wallet,amount_wei,status)
 VALUES('EDFW4Y7',rid,wallet,90*e,'PENDING') RETURNING id INTO pid;
 paidtime:=clock_timestamp();
 INSERT INTO public.reward_payout_transaction_settlements(round_id,tx_id,network,paid_at,block_number,finalized_head_number)
 VALUES(rid,tx,'mainnet',paidtime,5201,5210);
 UPDATE public.reward_payouts SET status='PAID',tx_id=tx,paid_at=paidtime WHERE id=pid;
 IF (SELECT reward_status FROM public.invitations WHERE invite_code='EDFW4Y7')<>'PAID'
   OR NOT EXISTS(SELECT 1 FROM public.reward_receipts WHERE payout_id=pid AND amount_wei=90*e)
   OR public.read_outstanding_reward_liability('mainnet',app)::numeric<>10*e
 THEN RAISE EXCEPTION 'Base payout receipt or X remaining liability incorrect'; END IF;
 UPDATE public.reward_x_promotion_obligations SET financial_state='RELEASED' WHERE invite_code='EDFW4Y7';
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>0
  OR public.read_reward_cohort_committed_wei('mainnet',app,129,receipt)<>90*e
 THEN RAISE EXCEPTION 'X release failed to restore pool exactly once'; END IF;
 UPDATE reward_admission_bridge.mission_auto_reset_settings_v1 SET enabled=false WHERE id=1;
END;
$financial$;
SELECT 'mission-retry-real-financial-authorities-qa-pass' AS result;

ROLLBACK;
