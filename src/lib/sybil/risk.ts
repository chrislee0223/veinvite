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
        args.currentRiskLevel === 'NONE' ||
        !args.currentRiskLevel
          ? 'HIGH'
          : args.currentRiskLevel,
      riskScore: args.currentRiskScore ?? 0,
      reason:
        args.currentReason ??
        'Confirmed abuse is blocked from rewards.',
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
        args.currentRiskLevel === 'NONE' ||
        !args.currentRiskLevel
          ? 'MEDIUM'
          : args.currentRiskLevel,
      riskScore: args.currentRiskScore ?? 0,
      reason:
        args.currentReason ??
        'Additional Sybil review is required.',
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
