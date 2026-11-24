\set ON_ERROR_STOP on
-- All values, wallets and transactions below are fake isolated fixtures.
DO $$
DECLARE v jsonb;
BEGIN
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'EDFW4Y7','mainnet',126,126,1000,1999,900,2100) INTO v;
 IF v->>'reason' <> 'FEATURE_DISABLED' THEN RAISE EXCEPTION 'Must begin disabled: %',v; END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1)
   OR EXISTS(SELECT 1 FROM public.invite_notification_history) THEN
   RAISE EXCEPTION 'Disabled feature mutated data';
 END IF;
END $$;

UPDATE reward_admission_bridge.mission_auto_reset_settings_v1
SET enabled=true WHERE id=1;

-- Reject incorrect chain/round or not-finalized proof.
DO $$
DECLARE v jsonb;
BEGIN
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'EDFW4Y7','mainnet',126,127,1000,1999,900,2100) INTO v;
 IF v->>'reason' <> 'ROUND_FINALITY_OR_BOUNDS_UNVERIFIED'
 THEN RAISE EXCEPTION 'Wrong round accepted: %',v; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'EDFW4Y7','mainnet',126,126,1000,1999,995,1005) INTO v;
 IF v->>'reason' <> 'ROUND_FINALITY_OR_BOUNDS_UNVERIFIED'
 THEN RAISE EXCEPTION 'Unfinalized round accepted: %',v; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'EDFW4Y7','mainnet',127,126,1000,1999,900,2100) INTO v;
 IF v->>'reason' <> 'UNVERIFIED_CURRENT_ROUND'
 THEN RAISE EXCEPTION 'Wrong current round accepted: %',v; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'ACXKGKC','mainnet',126,126,1000,1999,900,2100) INTO v;
 IF v->>'reason' <> 'INVITATION_PROTECTED'
 THEN RAISE EXCEPTION 'Eligible referral was reset: %',v; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'WVYTYY6','mainnet',126,126,1000,1999,900,2100) INTO v;
 IF v->>'reason' <> 'INVITATION_PROTECTED'
 THEN RAISE EXCEPTION 'Unbound old referral was reset: %',v; END IF;
END $$;

-- Belgian case: original 124, missed 125 vote, automatic 126 dApp and 127 vote.
DO $$
DECLARE v jsonb; i public.invitations%rowtype;
BEGIN
 SELECT * INTO i FROM public.invitations WHERE invite_code='EDFW4Y7';
 SELECT public.commit_invitation_mission_auto_reset_v1(
   'EDFW4Y7','mainnet',126,126,1000,1999,900,2100) INTO v;
 IF v->>'started'<>'true' OR v->>'dappRoundId'<>'126' OR
    v->>'voteRoundId'<>'127' OR v->>'attemptNo'<>'1'
 THEN RAISE EXCEPTION 'Legitimate reset failed: %',v; END IF;
 IF (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempts_v1
     WHERE invite_code='EDFW4Y7' AND attempt_start_block=1000
       AND dapp_round_id=126 AND vote_round_id=127 AND state='ACTIVE') <> 1
 THEN RAISE EXCEPTION 'Wrong round block or missing active attempt'; END IF;
 IF (SELECT count(*) FROM public.invite_notification_history
     WHERE invite_code='EDFW4Y7' AND kind='MISSION_PROGRESS_RESET'
       AND dapp_progress=0 AND recipient_wallet=lower(i.invitee_wallet)
       AND dedupe_key='mission-auto-reset-v1:EDFW4Y7:126') <> 1
 THEN RAISE EXCEPTION 'No exactly-once invitee notice'; END IF;
 IF (SELECT inviter_wallet FROM public.invitations WHERE invite_code='EDFW4Y7')
     IS DISTINCT FROM i.inviter_wallet OR
    (SELECT invitee_wallet FROM public.invitations WHERE invite_code='EDFW4Y7')
     IS DISTINCT FROM i.invitee_wallet OR
    (SELECT slot_released_at FROM public.invitations WHERE invite_code='EDFW4Y7')
     IS DISTINCT FROM i.slot_released_at OR
    (SELECT reward_cohort_round_id FROM public.invitations WHERE invite_code='EDFW4Y7')
     IS DISTINCT FROM i.reward_cohort_round_id
 THEN RAISE EXCEPTION 'Reset mutated original referral/slot/funding'; END IF;
END $$;

DO $$
DECLARE v jsonb;
BEGIN
 SELECT public.commit_invitation_mission_auto_reset_v1(
   'EDFW4Y7','mainnet',126,126,1000,1999,900,2100) INTO v;
 IF v->>'reason'<>'ALREADY_RESET'
 THEN RAISE EXCEPTION 'Duplicate request not idempotent: %',v; END IF;
 IF (SELECT count(*) FROM public.invite_notification_history
     WHERE invite_code='EDFW4Y7')<>1
 THEN RAISE EXCEPTION 'Duplicate notice delivered'; END IF;
END $$;

-- Second missed attempt at N+4, preserving both append-only attempt entries.
INSERT INTO public.vebetter_round_allocations
(network,app_id,vebetter_round_id,claim_block_number)
VALUES ('mainnet',
'0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
127, 2900);

DO $$
DECLARE v jsonb;
BEGIN
 SELECT public.commit_invitation_mission_auto_reset_v1(
   'EDFW4Y7','mainnet',128,128,3000,3999,2900,4100) INTO v;
 IF v->>'started'<>'true' OR v->>'attemptNo'<>'2'
 THEN RAISE EXCEPTION 'Next automatic reset failed: %',v; END IF;
 IF (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempts_v1
     WHERE invite_code='EDFW4Y7' AND state='EXPIRED') <> 1 OR
    (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempts_v1
     WHERE invite_code='EDFW4Y7' AND state='ACTIVE') <> 1 OR
    (SELECT count(*) FROM public.invite_notification_history
     WHERE invite_code='EDFW4Y7') <> 2
 THEN RAISE EXCEPTION 'Repeated expiry failed to preserve history/notice'; END IF;
END $$;

-- Turn off all writes: the default safety gate remains an independent switch.
UPDATE reward_admission_bridge.mission_auto_reset_settings_v1
SET enabled=false WHERE id=1;
SELECT 'mission-auto-reset-staged-qa-pass' as result;
