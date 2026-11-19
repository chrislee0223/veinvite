-- VeInvite multi-level: PRIVATE PREVIEW candidate chain observation bridge only.
-- Production NEVER runs this. The records are NOT qualified/paid entitlements.
-- Requires prior private ledger, integrity, carry and round-seal previews.
BEGIN;

CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.candidate_chain_observations (
  network text NOT NULL CHECK (network IN ('testnet','testnet-staging')),
  policy_version text NOT NULL DEFAULT 'multilevel-v1'
    CHECK (policy_version='multilevel-v1'),
  round_id bigint NOT NULL CHECK (round_id>=2),
  wallet text NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  kind text NOT NULL CHECK (kind IN ('ONBOARDING','ACTIVE')),
  first_onboarded_round_id bigint NOT NULL CHECK (first_onboarded_round_id>=1),
  dapp_round_id bigint NOT NULL CHECK (dapp_round_id>=1),
  source text NOT NULL DEFAULT 'THOR_READONLY_OBSERVATION_V1'
    CHECK (source='THOR_READONLY_OBSERVATION_V1'),
  scan_fingerprint text NOT NULL CHECK (scan_fingerprint ~ '^[0-9a-f]{64}$'),
  observed_eligible boolean NOT NULL,
  observation jsonb NOT NULL CHECK (jsonb_typeof(observation)='object'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network,policy_version,round_id,wallet),
  FOREIGN KEY (network,policy_version,round_id)
    REFERENCES veinvite_multilevel_staging.round_books(network,policy_version,round_id)
    ON DELETE RESTRICT,
  CONSTRAINT candidate_round_position CHECK (
    (kind='ONBOARDING' AND first_onboarded_round_id=round_id
      AND dapp_round_id+1=round_id)
    OR (kind='ACTIVE' AND first_onboarded_round_id<round_id
      AND dapp_round_id=round_id)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS multilevel_candidate_fingerprint_unique_idx
ON veinvite_multilevel_staging.candidate_chain_observations(
  network,policy_version,scan_fingerprint
);

CREATE TRIGGER multilevel_candidate_no_mutate
BEFORE UPDATE OR DELETE ON veinvite_multilevel_staging.candidate_chain_observations
FOR EACH ROW EXECUTE FUNCTION
  veinvite_multilevel_staging.forbid_money_history_mutation_v1();

ALTER TABLE veinvite_multilevel_staging.candidate_chain_observations
ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON veinvite_multilevel_staging.candidate_chain_observations
FROM PUBLIC,anon,authenticated;

-- This is the ONLY allowed preview ingestion gate. It creates observation
-- candidates, never qualifying events, entitlements, fund reservations or payouts.
CREATE OR REPLACE FUNCTION public.multilevel_preview_record_chain_observation_v1(
  p_network text,
  p_round_id bigint,
  p_wallet text,
  p_kind text,
  p_first_onboarded_round_id bigint,
  p_dapp_round_id bigint,
  p_scan_fingerprint text,
  p_observed_eligible boolean,
  p_observation jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  v_existing record;
  v_mode text;
  v_lifecycle text;
BEGIN
  IF p_network NOT IN ('testnet','testnet-staging')
    OR p_wallet !~ '^0x[0-9a-f]{40}$'
    OR p_kind NOT IN ('ONBOARDING','ACTIVE')
    OR p_round_id IS NULL OR p_round_id<2
    OR p_first_onboarded_round_id IS NULL
    OR p_dapp_round_id IS NULL
    OR p_scan_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_observed_eligible IS NULL
    OR p_observation IS NULL
    OR jsonb_typeof(p_observation)<>'object' THEN
    RAISE EXCEPTION 'MULTILEVEL_PREVIEW_OBSERVATION_INVALID';
  END IF;
  IF (p_kind='ONBOARDING' AND NOT (
      p_first_onboarded_round_id=p_round_id AND
      p_dapp_round_id+1=p_round_id
    )) OR
    (p_kind='ACTIVE' AND NOT (
      p_first_onboarded_round_id<p_round_id AND
      p_dapp_round_id=p_round_id
    )) THEN
    RAISE EXCEPTION 'MULTILEVEL_PREVIEW_ROUND_POSITION_INVALID';
  END IF;
  SELECT mode INTO v_mode
    FROM veinvite_multilevel_staging.policy_control
    WHERE policy_version='multilevel-v1';
  IF v_mode IS DISTINCT FROM 'STAGING_ONLY' THEN
    RAISE EXCEPTION 'MULTILEVEL_PREVIEW_DISABLED';
  END IF;
  -- Do not accept self-attested "verified" evidence as authorization.
  IF p_observation->>'authority' IS DISTINCT FROM 'READ_ONLY_CHAIN_OBSERVATION'
    OR p_observation->>'network' IS DISTINCT FROM p_network
    OR p_observation->>'wallet' IS DISTINCT FROM p_wallet
    OR p_observation->>'kind' IS DISTINCT FROM p_kind
    OR p_observation->>'earningRoundId' IS DISTINCT FROM p_round_id::text
    OR p_observation->>'dappRoundId' IS DISTINCT FROM p_dapp_round_id::text
    OR (p_observation->'verdict'->>'eligible')::boolean IS DISTINCT FROM p_observed_eligible THEN
    RAISE EXCEPTION 'MULTILEVEL_PREVIEW_OBSERVATION_SHAPE';
  END IF;
  -- Empty financial shell only. A dedicated later settlement pipeline may
  -- set its budgets after audited funding and anti-Sybil decisions.
  INSERT INTO veinvite_multilevel_staging.round_books(
    network,policy_version,round_id,participant_pool_wei,
    budget_onboarding_wei,budget_active_wei,budget_leader_wei,
    budget_dust_wei
  ) VALUES(p_network,'multilevel-v1',p_round_id,0,0,0,0,0)
  ON CONFLICT DO NOTHING;
  SELECT lifecycle INTO v_lifecycle
  FROM veinvite_multilevel_staging.round_books
  WHERE network=p_network AND policy_version='multilevel-v1'
    AND round_id=p_round_id FOR SHARE;
  IF v_lifecycle IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'MULTILEVEL_PREVIEW_ROUND_ALREADY_FROZEN';
  END IF;
  SELECT kind,first_onboarded_round_id,dapp_round_id,scan_fingerprint,
    observed_eligible,observation
  INTO v_existing
  FROM veinvite_multilevel_staging.candidate_chain_observations
  WHERE network=p_network AND policy_version='multilevel-v1'
    AND round_id=p_round_id AND wallet=p_wallet;
  IF FOUND THEN
    IF v_existing.kind=p_kind
      AND v_existing.first_onboarded_round_id=p_first_onboarded_round_id
      AND v_existing.dapp_round_id=p_dapp_round_id
      AND v_existing.scan_fingerprint=p_scan_fingerprint
      AND v_existing.observed_eligible=p_observed_eligible
      AND v_existing.observation=p_observation THEN
      RETURN 'ALREADY_RECORDED';
    END IF;
    RAISE EXCEPTION 'MULTILEVEL_PREVIEW_SNAPSHOT_CONFLICT';
  END IF;
  INSERT INTO veinvite_multilevel_staging.candidate_chain_observations(
    network,policy_version,round_id,wallet,kind,
    first_onboarded_round_id,dapp_round_id,scan_fingerprint,
    observed_eligible,observation
  ) VALUES (
    p_network,'multilevel-v1',p_round_id,p_wallet,p_kind,
    p_first_onboarded_round_id,p_dapp_round_id,
    p_scan_fingerprint,p_observed_eligible,p_observation
  );
  RETURN 'OBSERVED_ONLY';
END;
$fn$;

REVOKE ALL ON FUNCTION public.multilevel_preview_record_chain_observation_v1(
  text,bigint,text,text,bigint,bigint,text,boolean,jsonb
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.multilevel_preview_record_chain_observation_v1(
  text,bigint,text,text,bigint,bigint,text,boolean,jsonb
) TO service_role;

COMMIT;
