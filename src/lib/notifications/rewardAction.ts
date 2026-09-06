export type RewardActionQueueStatus =
  | 'AWAITING_CLAIM'
  | 'QUEUED'
  | 'ASSIGNED';

export type RewardActionItem = {
  inviteCode: string;
  status: RewardActionQueueStatus;
  reservedAmountWei: string;
  reservedAt: string;
  friendWallet: string | null;
};

export type RewardActionResponse = {
  walletAddress?: string;
  actions?: RewardActionItem[];
  error?: string;
};

export function isRewardActionQueueStatus(
  value: unknown,
): value is RewardActionQueueStatus {
  return (
    value === 'AWAITING_CLAIM' ||
    value === 'QUEUED' ||
    value === 'ASSIGNED'
  );
}
