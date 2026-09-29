-- Allow VePassport ecosystem-reputation evidence in Sybil v2.
--
-- The application already emits ECOSYSTEM_REPUTATION for read-only VePassport
-- signals. Keep the evidence-family constraint aligned with the policy type so
-- evidence persistence cannot silently fail while an assessment continues.

alter table public.sybil_v2_evidence_records
  drop constraint if exists sybil_v2_evidence_records_evidence_family_check;

alter table public.sybil_v2_evidence_records
  add constraint sybil_v2_evidence_records_evidence_family_check
  check (
    evidence_family = any (
      array[
        'FUNDING'::text,
        'HISTORICAL_REWARD'::text,
        'HISTORICAL_CONSOLIDATION'::text,
        'MISSION_BEHAVIOR'::text,
        'SECURITY_IDENTITY'::text,
        'POST_PAYOUT'::text,
        'CLUSTER_LINK'::text,
        'ECOSYSTEM_REPUTATION'::text
      ]
    )
  );
