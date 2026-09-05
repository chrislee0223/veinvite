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

export type SybilStatus =
  | 'NOT_CHECKED'
  | 'CLEAR'
  | 'REVIEW'
  | 'BLOCKED';

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
  rewardReservedAmountWei?: string;
  rewardReservedAt?: string;
  appsCompleted?: number;
  vot3Converted?: boolean;
  voteCompleted?: boolean;
  inviteSlot?: 1 | 2;
  slotReleasedAt?: string;
  sybilStatus?: SybilStatus;
  referralLinkId?: string;
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

export type RankMovement =
  | 'UP'
  | 'DOWN'
  | 'SAME'
  | 'NEW'
  | 'UNAVAILABLE';

export type PublicLeaderboardEntry = {
  rank: number;
  walletAddress: string;
  completedReferrals: number;
  totalRewardWei: string;
  isCurrentWallet: boolean;
  previousRank: number | null;
  rankChange: number | null;
  rankMovement: RankMovement;
};

export type PublicLeaderboardResponse = {
  generatedAt: string;
  network: 'mainnet' | 'testnet' | 'testnet-staging';
  currentRoundId: number;
  reportingStartRound: number | null;
  comparison: {
    available: boolean;
    roundId: number | null;
    endBlock: number | null;
    publishedAt: string | null;
    rankingAlgorithmVersion: string;
  };
  impact: {
    totalActivatedUsers: number;
    newUsers: number;
    returningUsers: number;
  };
  leaders: PublicLeaderboardEntry[];
  currentUser: PublicLeaderboardEntry | null;
};
