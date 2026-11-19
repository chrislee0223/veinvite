-- PREVIEW-ONLY / synthetic testnet actors / NO B3TR transfers.
-- Requires 20261119_multilevel_review_accept_new_onboarding_preview_v1.sql.
-- All candidate rows are removed via ROLLBACK. NEVER run on Production.
BEGIN;
SELECT public.multilevel_preview_record_chain_observation_v1(
  'testnet',151100004,'0x0000000000000000000000000000000000000001','ONBOARDING',151100004,151100003,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',true,
  '{"authority":"READ_ONLY_CHAIN_OBSERVATION","network":"testnet","wallet":"0x0000000000000000000000000000000000000001","kind":"ONBOARDING","earningRoundId":151100004,"dappRoundId":151100003,"verdict":{"eligible":true}}'::jsonb
);
SELECT public.multilevel_preview_record_chain_observation_v1(
  'testnet',151100004,'0x0000000000000000000000000000000000000003','ACTIVE',151100003,151100004,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',true,
  '{"authority":"READ_ONLY_CHAIN_OBSERVATION","network":"testnet","wallet":"0x0000000000000000000000000000000000000003","kind":"ACTIVE","earningRoundId":151100004,"dappRoundId":151100004,"verdict":{"eligible":true}}'::jsonb
);
DO $test$
DECLARE v_status text; rejected boolean:=false;
BEGIN
  SELECT public.multilevel_preview_record_review_packet_v1(
    'testnet',151100004,'0x0000000000000000000000000000000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','{"status":"REVIEW_REQUIRED","payable":false,"source":"READ_ONLY_ONBOARDING_CROSSCHECK_V1","network":"testnet","wallet":"0x0000000000000000000000000000000000000001","roundId":151100004,"evidenceFingerprint":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","structurallyEligible":true,"rejectionReasons":[],"lineage":{"wallet":"0x0000000000000000000000000000000000000001","eventBlock":320,"ancestors":[{"wallet":"0x0000000000000000000000000000000000000002","active":false}],"edgeIds":["test-edge"],"disconnectedAtLevel":2},"directInviterWallet":"0x0000000000000000000000000000000000000002"}'::jsonb
  ) INTO v_status;
  IF v_status<>'REVIEW_PACKET_STORED_NONPAYABLE' THEN
    RAISE EXCEPTION 'NEW_REVIEW_FAILED';
  END IF;
  SELECT public.multilevel_preview_record_review_packet_v1(
    'testnet',151100004,'0x0000000000000000000000000000000000000003','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','{"status":"REVIEW_REQUIRED","payable":false,"source":"READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1","network":"testnet","wallet":"0x0000000000000000000000000000000000000003","roundId":151100004,"evidenceFingerprint":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","structurallyEligible":true,"rejectionReasons":[],"lineage":{"wallet":"0x0000000000000000000000000000000000000003","eventBlock":320,"ancestors":[{"wallet":"0x0000000000000000000000000000000000000002","active":false}],"edgeIds":["test-edge"],"disconnectedAtLevel":2}}'::jsonb
  ) INTO v_status;
  IF v_status<>'REVIEW_PACKET_STORED_NONPAYABLE' THEN
    RAISE EXCEPTION 'ACTIVE_REVIEW_REGRESSION';
  END IF;
  SELECT public.multilevel_preview_record_review_packet_v1(
    'testnet',151100004,'0x0000000000000000000000000000000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','{"status":"REVIEW_REQUIRED","payable":false,"source":"READ_ONLY_ONBOARDING_CROSSCHECK_V1","network":"testnet","wallet":"0x0000000000000000000000000000000000000001","roundId":151100004,"evidenceFingerprint":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","structurallyEligible":true,"rejectionReasons":[],"lineage":{"wallet":"0x0000000000000000000000000000000000000001","eventBlock":320,"ancestors":[{"wallet":"0x0000000000000000000000000000000000000002","active":false}],"edgeIds":["test-edge"],"disconnectedAtLevel":2},"directInviterWallet":"0x0000000000000000000000000000000000000002"}'::jsonb
  ) INTO v_status;
  IF v_status<>'ALREADY_REVIEWED_NONPAYABLE' THEN
    RAISE EXCEPTION 'REPLAY_NOT_IDEMPOTENT';
  END IF;
  rejected:=false;
  BEGIN
    PERFORM public.multilevel_preview_record_review_packet_v1(
      'testnet',151100004,'0x0000000000000000000000000000000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '{"status":"REVIEW_REQUIRED","payable":false,"source":"READ_ONLY_ONBOARDING_CROSSCHECK_V1","network":"testnet","wallet":"0x0000000000000000000000000000000000000001","roundId":151100004,"evidenceFingerprint":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","structurallyEligible":true,"rejectionReasons":[],"lineage":{"wallet":"0x0000000000000000000000000000000000000001","eventBlock":320,"ancestors":[{"wallet":"0x0000000000000000000000000000000000000002","active":false}],"edgeIds":["test-edge"],"disconnectedAtLevel":2},"directInviterWallet":"0x0000000000000000000000000000000000000008"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    rejected:=SQLERRM LIKE '%MULTILEVEL_REVIEW_UNACCEPTABLE_PACKET%';
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'FORGED_INVITER_WAS_ACCEPTED'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.multilevel_preview_record_review_packet_v1(
      'testnet',151100004,'0x0000000000000000000000000000000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '{"status":"REVIEW_REQUIRED","payable":false,"source":"READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1","network":"testnet","wallet":"0x0000000000000000000000000000000000000001","roundId":151100004,"evidenceFingerprint":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","structurallyEligible":true,"rejectionReasons":[],"lineage":{"wallet":"0x0000000000000000000000000000000000000001","eventBlock":320,"ancestors":[{"wallet":"0x0000000000000000000000000000000000000002","active":false}],"edgeIds":["test-edge"],"disconnectedAtLevel":2},"directInviterWallet":"0x0000000000000000000000000000000000000002"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    rejected:=SQLERRM LIKE '%MULTILEVEL_REVIEW_SOURCE_NOT_CLEARED%';
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'NEW_WALLET_AS_LEGACY_WAS_ACCEPTED'; END IF;
  IF (SELECT count(*) FROM veinvite_multilevel_staging.candidate_review_packets
      WHERE round_id=151100004)<>2 THEN RAISE EXCEPTION 'WRONG_STAGED_REVIEW_COUNT'; END IF;
  IF (SELECT count(*) FROM veinvite_multilevel_staging.entitlements)<>0 OR
     (SELECT count(*) FROM veinvite_multilevel_staging.claim_legs)<>0 OR
     (SELECT count(*) FROM veinvite_multilevel_staging.verified_events)<>0 THEN
    RAISE EXCEPTION 'NONPAYABLE_REVIEW_GRANTED_PAYMENT';
  END IF;
END;
$test$;
ROLLBACK;
