import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';

export async function hasNewEvidenceForCurrentAssessment(
  inviteCode: string,
): Promise<boolean> {
  const [
    candidateResult,
    assessmentResult,
    invitationResult,
    evidenceResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('operator_sybil_v2_assessment_candidates')
      .select('invite_code')
      .eq('invite_code', inviteCode)
      .maybeSingle(),
    supabaseAdmin
      .from('sybil_v2_referral_assessments')
      .select('updated_at')
      .eq('invite_code', inviteCode)
      .maybeSingle(),
    supabaseAdmin
      .from('invitations')
      .select('identity_link_status,identity_link_checked_at')
      .eq('invite_code', inviteCode)
      .maybeSingle(),
    supabaseAdmin
      .from('sybil_v2_evidence_records')
      .select('created_at,strength,score')
      .eq('invite_code', inviteCode)
      .in('strength', ['MEDIUM', 'HIGH'])
      .gt('score', 0)
      .order('created_at', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle(),
  ]);

  if (candidateResult.error) {
    throw new Error(
      `Sybil v2 reassessment freshness could not be loaded: ${candidateResult.error.message}`,
    );
  }
  if (assessmentResult.error) {
    throw new Error(
      `Sybil v2 assessment freshness could not be loaded: ${assessmentResult.error.message}`,
    );
  }
  if (invitationResult.error) {
    throw new Error(
      `Sybil identity freshness could not be loaded: ${invitationResult.error.message}`,
    );
  }
  if (evidenceResult.error) {
    throw new Error(
      `Sybil evidence freshness could not be loaded: ${evidenceResult.error.message}`,
    );
  }

  if (candidateResult.data) {
    return true;
  }

  const assessedAt =
    typeof assessmentResult.data?.updated_at === 'string'
      ? Date.parse(assessmentResult.data.updated_at)
      : Number.NaN;

  if (Number.isNaN(assessedAt)) {
    return true;
  }

  const identityCheckedAt =
    typeof invitationResult.data
      ?.identity_link_checked_at === 'string'
      ? Date.parse(
          invitationResult.data.identity_link_checked_at,
        )
      : Number.NaN;
  const identityStatus =
    typeof invitationResult.data
      ?.identity_link_status === 'string'
      ? invitationResult.data.identity_link_status
      : 'UNKNOWN';

  if (
    ['REVIEW', 'LINKED_EXISTING'].includes(identityStatus) &&
    !Number.isNaN(identityCheckedAt) &&
    identityCheckedAt > assessedAt
  ) {
    return true;
  }

  const evidenceCreatedAt =
    typeof evidenceResult.data?.created_at === 'string'
      ? Date.parse(evidenceResult.data.created_at)
      : Number.NaN;

  return (
    !Number.isNaN(evidenceCreatedAt) &&
    evidenceCreatedAt > assessedAt
  );
}
