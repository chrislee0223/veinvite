-- VeInvite 5-level PREVIEW ONLY. Nonpayable candidate cross-check packet.
-- Isolated from production and from verified_events/entitlements/claims.
-- Requires multilevel chain observation bridge preview v1, never production.
BEGIN;
CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.candidate_review_packets (
  network text NOT NULL CHECK (network IN ('testnet','testnet-staging')),
  policy_version text NOT NULL DEFAULT 'multilevel-v1'
    CHECK (policy_version='multilevel-v1'),
  round_id bigint NOT NULL CHECK (round_id>=2),
  wallet text NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  source_scan_fingerprint text NOT NULL
    CHECK(source_scan_fingerprint ~ '^[0-9a-f]{64}$'),
  evidence_fingerprint text NOT NULL
    CHECK(evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  review_packet jsonb NOT NULL
    CHECK(jsonb_typeof(review_packet)='object'),
  review_state text NOT NULL DEFAULT 'NONPAYABLE_REVIEW_REQUIRED'
    CHECK(review_state='NONPAYABLE_REVIEW_REQUIRED'),
  payable boolean NOT NULL DEFAULT false CHECK(payable=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(network,policy_version,round_id,wallet),
  FOREIGN KEY(network,policy_version,round_id,wallet)
    REFERENCES veinvite_multilevel_staging.candidate_chain_observations(
      network,policy_version,round_id,wallet
    ) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS multilevel_candidate_review_fingerprint_unique_idx
ON veinvite_multilevel_staging.candidate_review_packets(
  network,policy_version,evidence_fingerprint
);
CREATE TRIGGER multilevel_review_packet_immutable
BEFORE UPDATE OR DELETE
ON veinvite_multilevel_staging.candidate_review_packets
FOR EACH ROW EXECUTE FUNCTION
  veinvite_multilevel_staging.forbid_money_history_mutation_v1();
ALTER TABLE veinvite_multilevel_staging.candidate_review_packets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON veinvite_multilevel_staging.candidate_review_packets
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.multilevel_preview_record_review_packet_v1(
  p_network text,
  p_round_id bigint,
  p_wallet text,
  p_source_scan_fingerprint text,
  p_evidence_fingerprint text,
  p_packet jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE v_c veinvite_multilevel_staging.candidate_chain_observations%ROWTYPE;
DECLARE v_found veinvite_multilevel_staging.candidate_review_packets%ROWTYPE;
DECLARE v_lifecycle text; v_mode text;
BEGIN
  IF p_network NOT IN ('testnet','testnet-staging')
    OR p_round_id IS NULL OR p_round_id<2
    OR p_wallet !~ '^0x[0-9a-f]{40}$'
    OR p_source_scan_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_evidence_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_packet IS NULL OR jsonb_typeof(p_packet)<>'object'
    OR octet_length(p_packet::text)>100000 THEN
    RAISE EXCEPTION 'MULTILEVEL_REVIEW_INVALID_INPUT';
  END IF;
  SELECT mode INTO v_mode FROM veinvite_multilevel_staging.policy_control
  WHERE policy_version='multilevel-v1';
  IF v_mode IS DISTINCT FROM 'STAGING_ONLY' THEN
    RAISE EXCEPTION 'MULTILEVEL_REVIEW_DISABLED';
  END IF;
  IF p_packet->>'status' IS DISTINCT FROM 'REVIEW_REQUIRED'
     OR p_packet->>'source' IS DISTINCT FROM 'READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1'
     OR p_packet->>'network' IS DISTINCT FROM p_network
     OR p_packet->>'wallet' IS DISTINCT FROM p_wallet
     OR p_packet->>'roundId' IS DISTINCT FROM p_round_id::text
     OR p_packet->>'evidenceFingerprint' IS DISTINCT FROM p_evidence_fingerprint
     OR p_packet->>'payable' IS DISTINCT FROM 'false'
     OR p_packet->>'structurallyEligible' IS DISTINCT FROM 'true'
     OR jsonb_typeof(p_packet->'rejectionReasons')<>'array'
     OR jsonb_array_length(p_packet->'rejectionReasons')<>0
     OR jsonb_typeof(p_packet->'lineage')<>'object'
     OR p_packet#>>'{lineage,wallet}' IS DISTINCT FROM p_wallet
     OR jsonb_typeof(p_packet#>'{lineage,ancestors}')<>'array'
     OR jsonb_array_length(p_packet#>'{lineage,ancestors}')>5
  THEN
    RAISE EXCEPTION 'MULTILEVEL_REVIEW_UNACCEPTABLE_PACKET';
  END IF;
  SELECT * INTO v_c
  FROM veinvite_multilevel_staging.candidate_chain_observations
  WHERE network=p_network AND policy_version='multilevel-v1'
    AND round_id=p_round_id AND wallet=p_wallet FOR SHARE;
  IF NOT FOUND OR v_c.kind<>'ACTIVE'
    OR v_c.observed_eligible IS DISTINCT FROM true
    OR v_c.scan_fingerprint<>p_source_scan_fingerprint
    OR v_c.first_onboarded_round_id>=p_round_id
  THEN
    RAISE EXCEPTION 'MULTILEVEL_REVIEW_SOURCE_NOT_CLEARED';
  END IF;
  SELECT lifecycle INTO v_lifecycle
  FROM veinvite_multilevel_staging.round_books
  WHERE network=p_network AND policy_version='multilevel-v1'
    AND round_id=p_round_id FOR SHARE;
  IF v_lifecycle IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'MULTILEVEL_REVIEW_ROUND_ALREADY_FROZEN';
  END IF;

  SELECT * INTO v_found
  FROM veinvite_multilevel_staging.candidate_review_packets
  WHERE network=p_network AND policy_version='multilevel-v1'
    AND round_id=p_round_id AND wallet=p_wallet;
  IF FOUND THEN
    IF v_found.source_scan_fingerprint=p_source_scan_fingerprint
       AND v_found.evidence_fingerprint=p_evidence_fingerprint
       AND v_found.review_packet=p_packet THEN
      RETURN 'ALREADY_REVIEWED_NONPAYABLE';
    END IF;
    RAISE EXCEPTION 'MULTILEVEL_REVIEW_CONFLICTING_SNAPSHOT';
  END IF;
  INSERT INTO veinvite_multilevel_staging.candidate_review_packets(
    network,policy_version,round_id,wallet,
    source_scan_fingerprint,evidence_fingerprint,review_packet
  ) VALUES (
    p_network,'multilevel-v1',p_round_id,p_wallet,
    p_source_scan_fingerprint,p_evidence_fingerprint,p_packet
  );
  -- Intentionally no writes to verified_events / reviewed_activity /
  -- entitlements / claim_legs / return_ledger. No live payment authority.
  RETURN 'REVIEW_PACKET_STORED_NONPAYABLE';
END;
$fn$;

REVOKE ALL ON FUNCTION public.multilevel_preview_record_review_packet_v1(
  text,bigint,text,text,text,jsonb
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.multilevel_preview_record_review_packet_v1(
  text,bigint,text,text,text,jsonb
) TO service_role;
COMMIT;
