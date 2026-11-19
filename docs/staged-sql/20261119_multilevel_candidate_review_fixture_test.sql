-- PREVIEW-only synthetic candidate review proof regression.
-- ALL DATA ROLLED BACK; DO NOT EXECUTE ON LIVE PRODUCTION.
BEGIN;
SELECT public.multilevel_preview_record_chain_observation_v1(
  'testnet',151100002,'0x0000000000000000000000000000000000000001','ACTIVE',151100001,151100002,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',true,'{"authority":"READ_ONLY_CHAIN_OBSERVATION","wallet":"0x0000000000000000000000000000000000000001","network":"testnet","kind":"ACTIVE","earningRoundId":151100002,"dappRoundId":151100002,"verdict":{"eligible":true}}'::jsonb
);
DO $test$
DECLARE v_status text;v_fail boolean:=false;
BEGIN
  SELECT public.multilevel_preview_record_review_packet_v1('testnet',151100002,'0x0000000000000000000000000000000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','{"status":"REVIEW_REQUIRED","payable":false,"source":"READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1","wallet":"0x0000000000000000000000000000000000000001","network":"testnet","roundId":151100002,"evidenceFingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","structurallyEligible":true,"rejectionReasons":[],"lineage":{"wallet":"0x0000000000000000000000000000000000000001","eventBlock":315,"ancestors":[{"wallet":"0x0000000000000000000000000000000000000002","active":true}],"edgeIds":["edge-123"],"disconnectedAtLevel":null}}'::jsonb)
    INTO v_status;
  IF v_status<>'REVIEW_PACKET_STORED_NONPAYABLE' THEN
    RAISE EXCEPTION 'REVIEW_NOT_STORED';
  END IF;
  SELECT public.multilevel_preview_record_review_packet_v1('testnet',151100002,'0x0000000000000000000000000000000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','{"status":"REVIEW_REQUIRED","payable":false,"source":"READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1","wallet":"0x0000000000000000000000000000000000000001","network":"testnet","roundId":151100002,"evidenceFingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","structurallyEligible":true,"rejectionReasons":[],"lineage":{"wallet":"0x0000000000000000000000000000000000000001","eventBlock":315,"ancestors":[{"wallet":"0x0000000000000000000000000000000000000002","active":true}],"edgeIds":["edge-123"],"disconnectedAtLevel":null}}'::jsonb)
    INTO v_status;
  IF v_status<>'ALREADY_REVIEWED_NONPAYABLE' THEN
    RAISE EXCEPTION 'REVIEW_IDEMPOTENCY_FAILURE';
  END IF;
  v_fail:=false;
  BEGIN
    PERFORM public.multilevel_preview_record_review_packet_v1(
      'testnet',151100002,'0x0000000000000000000000000000000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '{"status":"REVIEW_REQUIRED","payable":true,"source":"READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1","wallet":"0x0000000000000000000000000000000000000001","network":"testnet","roundId":151100002,"evidenceFingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","structurallyEligible":true,"rejectionReasons":[],"lineage":{"wallet":"0x0000000000000000000000000000000000000001","eventBlock":315,"ancestors":[{"wallet":"0x0000000000000000000000000000000000000002","active":true}],"edgeIds":["edge-123"],"disconnectedAtLevel":null}}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_fail:=SQLERRM LIKE '%MULTILEVEL_REVIEW_UNACCEPTABLE_PACKET%';
  END;
  IF NOT v_fail THEN RAISE EXCEPTION 'PAYABLE_PACKET_ACCEPTED'; END IF;
  v_fail:=false;
  BEGIN
    PERFORM public.multilevel_preview_record_review_packet_v1(
      'testnet',151100002,'0x0000000000000000000000000000000000000001','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '{"status":"REVIEW_REQUIRED","payable":false,"source":"READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1","wallet":"0x0000000000000000000000000000000000000001","network":"testnet","roundId":151100002,"evidenceFingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","structurallyEligible":true,"rejectionReasons":[],"lineage":{"wallet":"0x0000000000000000000000000000000000000001","eventBlock":315,"ancestors":[{"wallet":"0x0000000000000000000000000000000000000002","active":true}],"edgeIds":["edge-123"],"disconnectedAtLevel":null}}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_fail:=SQLERRM LIKE '%MULTILEVEL_REVIEW_SOURCE_NOT_CLEARED%';
  END;
  IF NOT v_fail THEN RAISE EXCEPTION 'FORGED_SOURCE_ACCEPTED'; END IF;
  v_fail:=false;
  BEGIN
    PERFORM public.multilevel_preview_record_review_packet_v1(
      'testnet',151100002,'0x0000000000000000000000000000000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '{"status":"REVIEW_REQUIRED","payable":false,"source":"READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1","wallet":"0x0000000000000000000000000000000000000001","network":"testnet","roundId":151100002,"evidenceFingerprint":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","structurallyEligible":true,"rejectionReasons":[],"lineage":{"wallet":"0x0000000000000000000000000000000000000001","eventBlock":315,"ancestors":[{"wallet":"0x0000000000000000000000000000000000000002","active":true}],"edgeIds":["edge-123"],"disconnectedAtLevel":null}}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_fail:=SQLERRM LIKE '%MULTILEVEL_REVIEW_CONFLICTING_SNAPSHOT%';
  END;
  IF NOT v_fail THEN RAISE EXCEPTION 'CONFLICT_ACCEPTED'; END IF;
  IF (SELECT count(*) FROM veinvite_multilevel_staging.verified_events)<>0
    OR (SELECT count(*) FROM veinvite_multilevel_staging.verified_round_activity)<>0
    OR (SELECT count(*) FROM veinvite_multilevel_staging.entitlements)<>0
    OR (SELECT count(*) FROM veinvite_multilevel_staging.claim_legs)<>0 THEN
    RAISE EXCEPTION 'REVIEW_LEAKED_INTO_PAYOUT_PIPELINE';
  END IF;
END;
$test$;
ROLLBACK;
