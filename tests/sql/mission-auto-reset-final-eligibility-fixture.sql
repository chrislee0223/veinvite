\set ON_ERROR_STOP on
-- Isolated fixture; synthetic assessment inputs exercise the real gate.
ALTER TABLE public.invitations ADD COLUMN identity_link_status text DEFAULT 'UNKNOWN',
 ADD COLUMN identity_link_checked_at timestamptz,ADD COLUMN identity_link_policy_version text,
 ADD COLUMN identity_link_evidence jsonb,ADD COLUMN sybil_source text,
 ADD COLUMN sybil_risk_level text,ADD COLUMN sybil_risk_score integer,ADD COLUMN sybil_reason text;
ALTER TABLE public.sybil_v2_referral_assessments
 ADD COLUMN network text,ADD COLUMN revision bigint,ADD COLUMN evidence_cutoff_block bigint,
 ADD COLUMN assessed_at timestamptz,ADD COLUMN evidence_summary jsonb,
 ADD COLUMN completed_checks jsonb,ADD COLUMN required_checks jsonb,ADD COLUMN risk_score integer;
CREATE FUNCTION public.sybil_v2_enforcement_enabled() RETURNS boolean LANGUAGE sql STABLE AS 'SELECT true';
CREATE OR REPLACE FUNCTION public.security_identity_v2_observation_complete(p_status text, p_checked_at timestamp with time zone, p_vote_completed_at timestamp with time zone, p_policy_version text, p_evidence jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select
    p_policy_version = 'security_client_v2'
    and p_status in (
      'NO_KNOWN_LINK',
      'REVIEW',
      'LINKED_EXISTING',
      'OPERATOR_CLEARED'
    )
    and p_checked_at is not null
    and p_vote_completed_at is not null
    and p_checked_at >= p_vote_completed_at
    and coalesce(p_evidence ->> 'observedClientCount', '') ~ '^[1-9][0-9]*$'
    and (
      p_status <> 'OPERATOR_CLEARED'
      or coalesce(p_evidence ->> 'operatorOverride', 'false') = 'true'
    );
$function$;
