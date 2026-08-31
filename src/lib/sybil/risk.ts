export type SybilStatus =
  | 'NOT_CHECKED'
  | 'CLEAR'
  | 'REVIEW'
  | 'BLOCKED';

export type SybilRiskLevel =
  | 'NONE'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH';

export type SybilSource =
  | 'SYSTEM'
  | 'VEPASSPORT'
  | 'ONCHAIN'
  | 'OPERATOR';

export type SybilDecision = {
  status: Exclude<SybilStatus, 'NOT_CHECKED'>;
  riskLevel: SybilRiskLevel;
  riskScore: number;
  reason: string | null;
  source: SybilSource;
};

const STATUS_PRIORITY: Record<SybilDecision['status'], number> = {
  CLEAR: 0,
  REVIEW: 1,
  BLOCKED: 2,
};

const RISK_LEVEL_PRIORITY: Record<SybilRiskLevel, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export function combineReferralPartySybilDecisions(args: {
  inviter: SybilDecision;
  invitee: SybilDecision;
}): SybilDecision {
  const candidates = [
    { role: 'Inviter', decision: args.inviter },
    { role: 'Invitee', decision: args.invitee },
  ];

  candidates.sort((left, right) => {
    const statusDifference =
      STATUS_PRIORITY[right.decision.status] -
      STATUS_PRIORITY[left.decision.status];
    if (statusDifference !== 0) return statusDifference;

    const scoreDifference =
      right.decision.riskScore - left.decision.riskScore;
    if (scoreDifference !== 0) return scoreDifference;

    return (
      RISK_LEVEL_PRIORITY[right.decision.riskLevel] -
      RISK_LEVEL_PRIORITY[left.decision.riskLevel]
    );
  });

  const selected = candidates[0];
  if (!selected) {
    throw new Error('Referral Sybil decision composition received no parties.');
  }

  const reason = selected.decision.reason
    ? `${selected.role}: ${selected.decision.reason}`
    : selected.decision.status === 'REVIEW'
      ? `${selected.role} requires additional Sybil review.`
      : selected.decision.status === 'BLOCKED'
        ? `${selected.role} is blocked from VeInvite rewards.`
        : null;

  return {
    ...selected.decision,
    reason,
  };
}

/**
 * Central post-vote Sybil gate.
 *
 * The first version is deliberately conservative:
 * - it never invents suspicion from weak signals such as shared funding;
 * - an existing REVIEW/BLOCKED decision is preserved;
 * - otherwise the referral passes the baseline gate after its real
 *   VeBetter activity and governance vote have been verified.
 *
 * VePassport and additional on-chain signals can be added here later
 * without changing the reward-settlement contract: only CLEAR can become
 * reward eligible in the database trigger.
 */
export function evaluatePostVoteSybilRisk(args: {
  currentStatus: SybilStatus;
  inviteStatus: string;
  currentRiskLevel?: SybilRiskLevel;
  currentRiskScore?: number;
  currentReason?: string | null;
  currentSource?: SybilSource;
}): SybilDecision {
  if (args.currentStatus === 'BLOCKED') {
    return {
      status: 'BLOCKED',
      riskLevel:
        args.currentRiskLevel === 'NONE' || !args.currentRiskLevel
          ? 'HIGH'
          : args.currentRiskLevel,
      riskScore: args.currentRiskScore ?? 0,
      reason:
        args.currentReason ?? 'Confirmed abuse is blocked from rewards.',
      source: args.currentSource ?? 'OPERATOR',
    };
  }

  if (
    args.currentStatus === 'REVIEW' ||
    args.inviteStatus === 'UNDER_REVIEW'
  ) {
    return {
      status: 'REVIEW',
      riskLevel:
        args.currentRiskLevel === 'NONE' || !args.currentRiskLevel
          ? 'MEDIUM'
          : args.currentRiskLevel,
      riskScore: args.currentRiskScore ?? 0,
      reason:
        args.currentReason ?? 'Additional Sybil review is required.',
      source: args.currentSource ?? 'SYSTEM',
    };
  }

  return {
    status: 'CLEAR',
    riskLevel: 'NONE',
    riskScore: 0,
    reason: null,
    source: 'SYSTEM',
  };
}
