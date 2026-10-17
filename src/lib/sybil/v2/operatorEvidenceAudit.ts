/**
 * Operator-only, read-only summary of persisted Sybil v2 evidence.
 *
 * IMPORTANT: evidence families are a conservative grouping for UI review,
 * not a complete proof of independent on-chain domains or of distinct humans.
 * An external operator investigation may exist without a structured record.
 * This function never authorizes CLEAR, BLACKLIST, REINSTATE or payout.
 */
export type OperatorEvidenceInput = {
  id: string | number;
  evidence_family: string;
  signal_code: string;
  strength: string;
  score: number;
  observed_block?: number | string | null;
  observed_at?: string | null;
};

export type OperatorEvidenceAudit = {
  storedSignals: number;
  highSignals: number;
  highFamilies: string[];
  highFamilyCount: number;
  infoSignals: number;
  provenanceAnchoredSignals: number;
  evidencePageMayBeTruncated: boolean;
  signalsShareHighFamily: boolean;
  independentHighCorroborationShown: boolean;
  requiresManualEvidenceReview: true;
  decisionAuthorized: false;
  cautionCodes: Array<
    | 'NO_STRUCTURED_EVIDENCE'
    | 'HIGH_SIGNALS_ONE_FAMILY'
    | 'NO_MULTI_FAMILY_HIGH_EVIDENCE'
    | 'EVIDENCE_PAGE_LIMIT_REACHED'
  >;
};

export function auditOperatorEvidence(
  records: readonly OperatorEvidenceInput[],
): OperatorEvidenceAudit {
  const high = records.filter(
    (record) => record.strength === 'HIGH' ||
      record.strength === 'CRITICAL',
  );
  const families = [...new Set(
    high.map((record) => record.evidence_family.trim())
      .filter(Boolean),
  )].sort();
  const cautions: OperatorEvidenceAudit['cautionCodes'] = [];

  if (records.length === 0) {
    cautions.push('NO_STRUCTURED_EVIDENCE');
  } else if (high.length >= 2 && families.length === 1) {
    cautions.push('HIGH_SIGNALS_ONE_FAMILY');
  }

  if (families.length < 2) {
    cautions.push('NO_MULTI_FAMILY_HIGH_EVIDENCE');
  }
  if (records.length >= 100) {
    cautions.push('EVIDENCE_PAGE_LIMIT_REACHED');
  }

  return {
    storedSignals: records.length,
    highSignals: high.length,
    highFamilies: families,
    highFamilyCount: families.length,
    infoSignals: records.filter((record) => record.strength === 'INFO').length,
    provenanceAnchoredSignals: records.filter((record) =>
      (typeof record.observed_block === 'number' &&
        Number.isSafeInteger(record.observed_block) &&
        record.observed_block >= 0) ||
      (typeof record.observed_block === 'string' &&
        /^[0-9]+$/.test(record.observed_block)) ||
      (typeof record.observed_at === 'string' &&
        !Number.isNaN(Date.parse(record.observed_at))),
    ).length,
    evidencePageMayBeTruncated: records.length >= 100,
    signalsShareHighFamily: high.length >= 2 && families.length === 1,
    // Even two distinct evidence families are not *proof* of independent
    // sources; this field only reports whether the narrow precondition was
    // observed in persisted structured evidence.
    independentHighCorroborationShown: families.length >= 2,
    requiresManualEvidenceReview: true,
    decisionAuthorized: false,
    cautionCodes: cautions,
  };
}
