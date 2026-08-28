export type InviteStatus =
  | 'PENDING_ACCEPTANCE'
  | 'ACTIVATING'
  | 'UNDER_REVIEW'
  | 'COMPLETED'
  | 'CANCELLED';

export type RewardEligibility =
  | 'NONE'
  | 'PENDING'
  | 'ELIGIBLE'
  | 'PAID'
  | 'FORFEITED';

export type RewardQueueStatus =
  | 'AWAITING_CLAIM'
  | 'QUEUED'
  | 'ASSIGNED'
  | 'CANCELLED';

export interface InviteRecord {
  code: string;
  inviterAddress: string;
  inviteeAddress?: string;
  status: InviteStatus;
  createdAt: string;
  updatedAt: string;
  rewardEligibility: RewardEligibility;
  rewardQueueStatus?: RewardQueueStatus;
  rewardClaimRequestedAt?: string;
}

export type EligibilityOutcome =
  | 'eligible'
  | 'existing_vebetter_user'
  | 'already_referred'
  | 'self_referral'
  | 'review';

export interface EligibilityResult {
  outcome: EligibilityOutcome;
  message: string;
}
