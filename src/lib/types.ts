export type InviteStatus =
  | 'PENDING_ACCEPTANCE'
  | 'ACTIVATING'
  | 'UNDER_REVIEW'
  | 'COMPLETED'
  | 'CANCELLED';

export type RewardEligibility = 'NONE' | 'PENDING' | 'ELIGIBLE' | 'FORFEITED';

export interface InviteRecord {
  code: string;
  inviterAddress: string;
  inviteeAddress?: string;
  status: InviteStatus;
  createdAt: string;
  updatedAt: string;
  rewardEligibility: RewardEligibility;
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
