export const SYBIL_V2_POLICY_VERSION = 'sybil-v2.0';

export type SybilV2EvidenceFamily =
  | 'FUNDING'
  | 'HISTORICAL_REWARD'
  | 'HISTORICAL_CONSOLIDATION'
  | 'MISSION_BEHAVIOR'
  | 'SECURITY_IDENTITY'
  | 'POST_PAYOUT'
  | 'CLUSTER_LINK';

export type SybilV2SignalStrength =
  | 'INFO'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH';

export type SybilV2Signal = {
  code: string;
  family: SybilV2EvidenceFamily;
  strength: SybilV2SignalStrength;
  score: number;
  independentKey?: string;
};

export type SybilV2AssessmentState =
  | 'ANALYSIS_PENDING'
  | 'ANALYSIS_FAILED'
  | 'CLEAR'
  | 'WATCH'
  | 'HOLD'
  | 'RESTRICTED';

export type SybilV2PolicyResult = {
  state: SybilV2AssessmentState;
  riskScore: number;
  reasonCodes: string[];
  evidenceFamilies: SybilV2EvidenceFamily[];
  strongEvidenceFamilies: SybilV2EvidenceFamily[];
};

const STRENGTH_RANK: Record<SybilV2SignalStrength, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Sybil v2 intentionally evaluates independent evidence families instead of
 * treating one suspicious event as proof. This is important for an onboarding
 * product where a friend can legitimately sponsor VTHO, share a device once,
 * or recommend the same dApps.
 *
 * HOLD requires corroboration from at least two independent evidence families.
 * A single family can become WATCH, but never BLACKLIST/RESTRICTED on its own.
 * RESTRICTED is reserved for an already-active operator/system wallet
 * restriction that was decided outside this scoring function.
 */
export function evaluateSybilV2Policy({
  signals,
  requiredChecksComplete,
  analysisFailed = false,
  activeRestriction = false,
}: {
  signals: SybilV2Signal[];
  requiredChecksComplete: boolean;
  analysisFailed?: boolean;
  activeRestriction?: boolean;
}): SybilV2PolicyResult {
  const normalized = signals
    .filter((signal) =>
      Boolean(signal.code) &&
      Number.isFinite(signal.score) &&
      signal.score >= 0,
    )
    .map((signal) => ({
      ...signal,
      score: clampScore(signal.score),
    }));

  const reasonCodes = unique(
    normalized
      .filter((signal) => signal.score > 0)
      .map((signal) => signal.code),
  );

  const evidenceFamilies = unique(
    normalized
      .filter((signal) => signal.score > 0)
      .map((signal) => signal.family),
  );

  const strongEvidenceFamilies = unique(
    normalized
      .filter((signal) =>
        signal.score > 0 &&
        STRENGTH_RANK[signal.strength] >= STRENGTH_RANK.MEDIUM,
      )
      .map((signal) => signal.family),
  );

  // Cap each family contribution so a single repeated pattern cannot inflate
  // itself into HOLD merely by creating many near-duplicate signals.
  const familyScores = new Map<SybilV2EvidenceFamily, number>();
  for (const signal of normalized) {
    const current = familyScores.get(signal.family) ?? 0;
    familyScores.set(
      signal.family,
      Math.max(current, signal.score),
    );
  }

  const rawRiskScore = [...familyScores.values()]
    .reduce((sum, score) => sum + score, 0);
  const riskScore = clampScore(rawRiskScore);

  if (activeRestriction) {
    return {
      state: 'RESTRICTED',
      riskScore: 100,
      reasonCodes: unique(['ACTIVE_WALLET_RESTRICTION', ...reasonCodes]),
      evidenceFamilies,
      strongEvidenceFamilies,
    };
  }

  if (analysisFailed) {
    return {
      state: 'ANALYSIS_FAILED',
      riskScore,
      reasonCodes: unique(['ANALYSIS_FAILED', ...reasonCodes]),
      evidenceFamilies,
      strongEvidenceFamilies,
    };
  }

  if (!requiredChecksComplete) {
    return {
      state: 'ANALYSIS_PENDING',
      riskScore,
      reasonCodes,
      evidenceFamilies,
      strongEvidenceFamilies,
    };
  }

  // Two independent medium/high evidence families are required to HOLD.
  // This prevents same-device, shared VTHO, or one common dApp from blocking
  // a legitimate onboarding referral on their own.
  if (strongEvidenceFamilies.length >= 2) {
    return {
      state: 'HOLD',
      riskScore: Math.max(60, riskScore),
      reasonCodes,
      evidenceFamilies,
      strongEvidenceFamilies,
    };
  }

  // One strong family or a meaningful combination of weaker families remains
  // payable but is watched after payout.
  if (
    strongEvidenceFamilies.length === 1 ||
    riskScore >= 25 ||
    evidenceFamilies.length >= 2
  ) {
    return {
      state: 'WATCH',
      riskScore,
      reasonCodes,
      evidenceFamilies,
      strongEvidenceFamilies,
    };
  }

  return {
    state: 'CLEAR',
    riskScore,
    reasonCodes,
    evidenceFamilies,
    strongEvidenceFamilies,
  };
}
