export const SYBIL_V2_POLICY_VERSION = 'sybil-v2.14';

export type SybilV2EvidenceFamily =
  | 'FUNDING'
  | 'HISTORICAL_REWARD'
  | 'HISTORICAL_CONSOLIDATION'
  | 'MISSION_BEHAVIOR'
  | 'SECURITY_IDENTITY'
  | 'POST_PAYOUT'
  | 'CLUSTER_LINK'
  | 'ECOSYSTEM_REPUTATION';

export type SybilV2EvidenceDomain =
  | 'HISTORICAL_ACTIVITY'
  | 'FUNDING'
  | 'MISSION_BEHAVIOR'
  | 'SECURITY_IDENTITY'
  | 'POST_PAYOUT'
  | 'CLUSTER_LINK'
  | 'ECOSYSTEM_REPUTATION';

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
  // Legacy persisted value only. Sybil v2.14 never emits WATCH for a new
  // reward decision; historical rows remain readable for audit compatibility.
  | 'WATCH'
  | 'HOLD'
  | 'RESTRICTED';

export type SybilV2PolicyResult = {
  state: SybilV2AssessmentState;
  riskScore: number;
  reasonCodes: string[];
  evidenceFamilies: SybilV2EvidenceFamily[];
  strongEvidenceFamilies: SybilV2EvidenceFamily[];
  evidenceDomains: SybilV2EvidenceDomain[];
  strongEvidenceDomains: SybilV2EvidenceDomain[];
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

const HISTORICAL_ACTIVITY_CLUSTER_CODES = new Set([
  'HISTORICAL_SINK_REAPPEARS_AS_INVITER',
  // A later transfer to the same kind of B3TR concentration hub is useful
  // new evidence, but it is still the same underlying consolidation
  // relationship. Keep it in HISTORICAL_ACTIVITY so one hub cannot count
  // twice as two independent domains and manufacture a HOLD.
  'WATCH_SUBJECT_TO_CLUSTER_HUB',
]);

const FUNDING_DERIVED_CLUSTER_CODES = new Set([
  'RECENT_FUNDER_IS_HISTORICAL_COMMON_SINK',
  'SHARED_RECENT_FUNDER_IS_MULTI_INVITER',
]);

const STANDALONE_HOLD_CODES = new Set([
  'SECURITY_CLIENT_INVITER_LINK',
]);

// These are meaningful association signals, but association alone is not
// sufficient to pause a legitimate referral. They still contribute risk and
// can corroborate another independent domain.
const ASSOCIATION_ONLY_HIGH_CODES = new Set([
  'RECENT_FUNDER_IS_HISTORICAL_COMMON_SINK',
]);

const HIGH_LIKELIHOOD_HISTORICAL_HOLD_CODES = [
  'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER',
  'HISTORICAL_COMMON_B3TR_SINK',
  'HISTORICAL_SINK_REAPPEARS_AS_INVITER',
] as const;

function hasExtremeSingleDomainPattern(
  signals: SybilV2Signal[],
): boolean {
  if (
    signals.some((signal) =>
      STANDALONE_HOLD_CODES.has(signal.code) &&
      STRENGTH_RANK[signal.strength] >= STRENGTH_RANK.MEDIUM &&
      signal.score > 0,
    )
  ) {
    return true;
  }

  // Funding evidence remains one FUNDING domain even when a recent funder
  // was also a historical common sink. That relationship can corroborate a
  // separate historical, mission, identity, or post-payout domain, but it must
  // not HOLD by itself.

  // A single generic historical clue remains monitoring-only. However, synchronized
  // reward behavior + a common B3TR consolidation sink + that same sink
  // reappearing as a VeInvite inviter is a high-likelihood coordinated pattern.
  // The three conditions describe distinct structural observations of the same
  // cluster and are sufficiently unlikely to be treated as ordinary user
  // similarity, so pause the reward for operator review even though the policy
  // intentionally keeps them in one HISTORICAL_ACTIVITY domain.
  const highHistoricalCodes = new Set(
    signals
      .filter((signal) =>
        signal.score > 0 &&
        STRENGTH_RANK[signal.strength] >= STRENGTH_RANK.HIGH,
      )
      .map((signal) => signal.code),
  );

  if (
    HIGH_LIKELIHOOD_HISTORICAL_HOLD_CODES.every((code) =>
      highHistoricalCodes.has(code),
    )
  ) {
    return true;
  }

  return false;
}

function evidenceDomain(
  signal: SybilV2Signal,
): SybilV2EvidenceDomain {
  if (
    signal.family === 'HISTORICAL_REWARD' ||
    signal.family === 'HISTORICAL_CONSOLIDATION' ||
    HISTORICAL_ACTIVITY_CLUSTER_CODES.has(signal.code)
  ) {
    return 'HISTORICAL_ACTIVITY';
  }

  if (
    signal.family === 'FUNDING' ||
    FUNDING_DERIVED_CLUSTER_CODES.has(signal.code)
  ) {
    return 'FUNDING';
  }

  return signal.family;
}

/**
 * Sybil v2 intentionally evaluates independent evidence families instead of
 * treating one suspicious event as proof. This is important for an onboarding
 * product where a friend can legitimately sponsor VTHO, share a device once,
 * or recommend the same dApps.
 *
 * HOLD normally requires corroboration from at least two independent evidence
 * domains. Closely related signals derived from the same historical flow or
 * recent funding relationship are collapsed into one domain before escalation.
 *
 * Direct invitee↔inviter same-security-client evidence may HOLD from one
 * domain because it is an identity-level conflict. A high-likelihood
 * historical cluster may also HOLD when synchronized rewards, a common B3TR
 * sink, and that sink reappearing as a VeInvite inviter all corroborate the
 * same coordinated cluster. Generic historical or funding clues remain monitoring-only
 * unless separately corroborated. These are review pauses, not automatic
 * BLACKLIST decisions. VeInvite intentionally
 * avoids fabricated numeric probabilities until enough labeled normal-vs-Sybil
 * data exists to calibrate them. RESTRICTED remains reserved
 * for an already-active operator/system wallet restriction decided outside
 * this scoring function.
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

  const evidenceDomains = unique(
    normalized
      .filter((signal) => signal.score > 0)
      .map(evidenceDomain),
  );

  const strongEvidenceDomains = unique(
    normalized
      .filter((signal) =>
        signal.score > 0 &&
        STRENGTH_RANK[signal.strength] >= STRENGTH_RANK.MEDIUM,
      )
      .map(evidenceDomain),
  );

  // Cap each independent-domain contribution so several signals derived from
  // one underlying flow cannot inflate risk or self-escalate into HOLD.
  const domainScores = new Map<SybilV2EvidenceDomain, number>();
  for (const signal of normalized) {
    const domain = evidenceDomain(signal);
    const current = domainScores.get(domain) ?? 0;
    domainScores.set(
      domain,
      Math.max(current, signal.score),
    );
  }

  const rawRiskScore = [...domainScores.values()]
    .reduce((sum, score) => sum + score, 0);
  const riskScore = clampScore(rawRiskScore);

  if (activeRestriction) {
    return {
      state: 'RESTRICTED',
      riskScore: 100,
      reasonCodes: unique(['ACTIVE_WALLET_RESTRICTION', ...reasonCodes]),
      evidenceFamilies,
      strongEvidenceFamilies,
      evidenceDomains,
      strongEvidenceDomains,
    };
  }

  if (analysisFailed) {
    return {
      state: 'ANALYSIS_FAILED',
      riskScore,
      reasonCodes: unique(['ANALYSIS_FAILED', ...reasonCodes]),
      evidenceFamilies,
      strongEvidenceFamilies,
      evidenceDomains,
      strongEvidenceDomains,
    };
  }

  // Strong adverse evidence may pause participation before every later-stage
  // check (for example post-vote identity/finality) is available. Partial
  // analysis may never CLEAR a wallet; it can only fail closed into HOLD.
  if (hasExtremeSingleDomainPattern(normalized)) {
    return {
      state: 'HOLD',
      riskScore: Math.max(70, riskScore),
      reasonCodes,
      evidenceFamilies,
      strongEvidenceFamilies,
      evidenceDomains,
      strongEvidenceDomains,
    };
  }

  const highEvidenceDomains = unique(
    normalized
      .filter((signal) =>
        signal.score > 0 &&
        STRENGTH_RANK[signal.strength] >= STRENGTH_RANK.HIGH &&
        !ASSOCIATION_ONLY_HIGH_CODES.has(signal.code),
      )
      .map(evidenceDomain),
  );

  // WATCH is no longer a payable decision state. A directly adverse HIGH
  // evidence domain stops the reward before money leaves VeInvite. Pure
  // association-only HIGH signals do not HOLD by themselves; they must be
  // corroborated by another independent domain.
  if (highEvidenceDomains.length >= 1) {
    return {
      state: 'HOLD',
      riskScore: Math.max(60, riskScore),
      reasonCodes,
      evidenceFamilies,
      strongEvidenceFamilies,
      evidenceDomains,
      strongEvidenceDomains,
    };
  }

  // Two independent MEDIUM-or-stronger domains also require review. A single
  // LOW/MEDIUM observation is not enough to HOLD by itself.
  if (strongEvidenceDomains.length >= 2) {
    return {
      state: 'HOLD',
      riskScore: Math.max(60, riskScore),
      reasonCodes,
      evidenceFamilies,
      strongEvidenceFamilies,
      evidenceDomains,
      strongEvidenceDomains,
    };
  }

  // Missing later-stage checks can never produce CLEAR. This is deliberately
  // after adverse-signal escalation so strong historical evidence can HOLD a
  // pre-vote referral while identity/finality remain pending.
  if (!requiredChecksComplete) {
    return {
      state: 'ANALYSIS_PENDING',
      riskScore,
      reasonCodes,
      evidenceFamilies,
      strongEvidenceFamilies,
      evidenceDomains,
      strongEvidenceDomains,
    };
  }

  return {
    state: 'CLEAR',
    riskScore,
    reasonCodes,
    evidenceFamilies,
    strongEvidenceFamilies,
    evidenceDomains,
    strongEvidenceDomains,
  };
}
