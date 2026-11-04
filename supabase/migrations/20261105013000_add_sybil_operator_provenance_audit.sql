BEGIN;

-- The existing v2 assessment events remain the canonical decision record.
-- This table is an append-only *attribution* ledger, not a new Sybil
-- enforcement gate. No wallet signature is inferred from a chat approval.
CREATE TABLE IF NOT EXISTS public.sybil_operator_action_provenance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_event_id bigint NOT NULL UNIQUE
    REFERENCES public.sybil_v2_assessment_events(id) ON DELETE RESTRICT,
  invite_code text NOT NULL,
  network text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('BLACKLIST', 'CLEAR')),
  decision_at timestamptz NOT NULL,
  approval_channel text NOT NULL CHECK (approval_channel IN (
    'CHAT_APPROVAL_REPORTED', 'OPERATOR_WALLET_RECORDED', 'UNVERIFIED_PRIVILEGED_ACTION'
  )),
  execution_channel text NOT NULL CHECK (execution_channel IN (
    'CHATGPT_SUPABASE_CONNECTOR_REPORTED', 'PRIVILEGED_OPERATOR_RPC', 'UNKNOWN'
  )),
  proof_level text NOT NULL CHECK (proof_level IN (
    'CHAT_REQUEST_NOT_WALLET_SIGNED', 'WALLET_ADDRESS_ONLY_NO_DECISION_SIGNATURE', 'UNKNOWN'
  )),
  recorded_operator_wallet text CHECK (
    recorded_operator_wallet IS NULL
    OR (
      recorded_operator_wallet ~ '^0x[0-9a-f]{40}$'
      AND recorded_operator_wallet <> '0x0000000000000000000000000000000000000000'
    )
  ),
  provenance_note text NOT NULL,
  historical_backfill boolean NOT NULL DEFAULT false,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT sybil_provenance_wallet_channel_check CHECK (
    (approval_channel = 'OPERATOR_WALLET_RECORDED')
      = (recorded_operator_wallet IS NOT NULL)
  )
);

COMMENT ON TABLE public.sybil_operator_action_provenance IS
  'Append-only source-attribution metadata for operator Sybil v2 decisions. A reported chat approval is NOT a wallet signature; a wallet address in an event is not by itself signature proof.';
COMMENT ON COLUMN public.sybil_operator_action_provenance.decision_at IS
  'Original assessment-event time, never the time a historical attribution was added.';
COMMENT ON COLUMN public.sybil_operator_action_provenance.proof_level IS
  'Exact limits of evidence available for attribution; no fabricated wallet-session or cryptographic attestation.';

CREATE INDEX IF NOT EXISTS sybil_operator_provenance_code_time_idx
  ON public.sybil_operator_action_provenance (invite_code, decision_at DESC);

ALTER TABLE public.sybil_operator_action_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sybil_operator_action_provenance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sybil_operator_action_provenance TO service_role;

CREATE OR REPLACE FUNCTION public.capture_sybil_operator_action_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_raw_wallet text := lower(btrim(coalesce(NEW.evidence_summary ->> 'operatorWallet', '')));
  v_reason text := coalesce(NEW.evidence_summary ->> 'operatorReason', '');
  v_chat_reported boolean;
  v_wallet text := NULL;
  v_approval text;
  v_execution text;
  v_proof text;
  v_note text;
BEGIN
  IF NEW.source <> 'OPERATOR' OR NEW.state NOT IN ('CLEAR', 'RESTRICTED') THEN
    RETURN NEW;
  END IF;

  v_chat_reported :=
    v_raw_wallet = '0x0000000000000000000000000000000000000000'
    AND v_reason LIKE 'Owner-authorized via connected ChatGPT/Supabase%';

  IF v_chat_reported THEN
    v_approval := 'CHAT_APPROVAL_REPORTED';
    v_execution := 'CHATGPT_SUPABASE_CONNECTOR_REPORTED';
    v_proof := 'CHAT_REQUEST_NOT_WALLET_SIGNED';
    v_note := 'Based on the decision event''s own self-reported ChatGPT execution text. User authorization was not independently wallet-signed or cryptographically attested.';
  ELSIF v_raw_wallet ~ '^0x[0-9a-f]{40}$'
        AND v_raw_wallet <> '0x0000000000000000000000000000000000000000' THEN
    v_wallet := v_raw_wallet;
    v_approval := 'OPERATOR_WALLET_RECORDED';
    v_execution := 'PRIVILEGED_OPERATOR_RPC';
    v_proof := 'WALLET_ADDRESS_ONLY_NO_DECISION_SIGNATURE';
    v_note := 'An operator wallet address was recorded by the decision RPC. The normal VeInvite admin API validates a wallet session, but the assessment event alone does not prove a per-decision wallet signature or which route invoked it.';
  ELSE
    v_approval := 'UNVERIFIED_PRIVILEGED_ACTION';
    v_execution := 'UNKNOWN';
    v_proof := 'UNKNOWN';
    v_note := 'No trustworthy approval/execution route can be derived from the original assessment event; do not invent an operator identity.';
  END IF;

  INSERT INTO public.sybil_operator_action_provenance (
    assessment_event_id, invite_code, network, decision, decision_at,
    approval_channel, execution_channel, proof_level,
    recorded_operator_wallet, provenance_note, historical_backfill
  ) VALUES (
    NEW.id, NEW.invite_code, NEW.network,
    CASE WHEN NEW.state = 'RESTRICTED' THEN 'BLACKLIST' ELSE 'CLEAR' END,
    NEW.created_at, v_approval, v_execution, v_proof,
    v_wallet, v_note, false
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_sybil_operator_action_provenance()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sybil_operator_decision_capture_provenance
  ON public.sybil_v2_assessment_events;
CREATE TRIGGER sybil_operator_decision_capture_provenance
  AFTER INSERT ON public.sybil_v2_assessment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_sybil_operator_action_provenance();

-- Do not overwrite or erase past attribution or assessment history.
DROP TRIGGER IF EXISTS sybil_operator_provenance_immutable
  ON public.sybil_operator_action_provenance;
CREATE TRIGGER sybil_operator_provenance_immutable
  BEFORE UPDATE OR DELETE ON public.sybil_operator_action_provenance
  FOR EACH ROW EXECUTE FUNCTION public.prevent_operator_ledger_mutation();

DROP TRIGGER IF EXISTS sybil_operator_provenance_no_truncate
  ON public.sybil_operator_action_provenance;
CREATE TRIGGER sybil_operator_provenance_no_truncate
  BEFORE TRUNCATE ON public.sybil_operator_action_provenance
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_operator_ledger_mutation();

-- Five ChatGPT-initiated operator blacklists executed on 2026-11-04 UTC.
-- Preserve their original audit rows, including the historic 0x000...000
-- placeholder. Attach only a separately timestamped, non-wallet-signed fact.
DO $$
DECLARE v_source_count integer;
BEGIN
  SELECT COUNT(*) INTO v_source_count
  FROM public.sybil_v2_assessment_events e
  WHERE e.invite_code IN (
    'M7BEG8X', 'UNUZTP7', 'ZKBL7RZ', 'P4WZYUG', 'YJNDTFG'
  )
    AND e.source = 'OPERATOR'
    AND e.state = 'RESTRICTED'
    AND e.evidence_summary ->> 'operatorDecision' = 'BLACKLIST'
    AND e.evidence_summary ->> 'operatorWallet'
        = '0x0000000000000000000000000000000000000000'
    AND e.evidence_summary ->> 'operatorReason'
        LIKE 'Owner-authorized via connected ChatGPT/Supabase%';
  IF v_source_count <> 5 THEN
    RAISE EXCEPTION 'Expected 5 verified historic blacklist decision events, found %', v_source_count;
  END IF;
END;
$$;

INSERT INTO public.sybil_operator_action_provenance (
  assessment_event_id, invite_code, network, decision, decision_at,
  approval_channel, execution_channel, proof_level,
  recorded_operator_wallet, provenance_note, historical_backfill
)
SELECT e.id, e.invite_code, e.network, 'BLACKLIST', e.created_at,
  'CHAT_APPROVAL_REPORTED', 'CHATGPT_SUPABASE_CONNECTOR_REPORTED',
  'CHAT_REQUEST_NOT_WALLET_SIGNED', NULL,
  'Historical attribution: project owner instructed the assistant in a ChatGPT conversation; ChatGPT executed via connected Supabase. This is a reported chat instruction, NOT a wallet signature or independently verified human identity. Original immutable event remains unchanged.',
  true
FROM public.sybil_v2_assessment_events e
WHERE e.invite_code IN (
  'M7BEG8X', 'UNUZTP7', 'ZKBL7RZ', 'P4WZYUG', 'YJNDTFG'
)
  AND e.source = 'OPERATOR' AND e.state = 'RESTRICTED'
  AND e.evidence_summary ->> 'operatorDecision' = 'BLACKLIST'
  AND e.evidence_summary ->> 'operatorWallet'
      = '0x0000000000000000000000000000000000000000'
  AND e.evidence_summary ->> 'operatorReason'
      LIKE 'Owner-authorized via connected ChatGPT/Supabase%'
ON CONFLICT (assessment_event_id) DO NOTHING;

COMMIT;
