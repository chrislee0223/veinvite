import type {
  InviteNotificationKindV2,
} from './inviteNotificationStateV2';

export type InviteNotificationHistoryItem = {
  id: string;
  inviteCode: string;
  kind: InviteNotificationKindV2;
  stage: number;
  eventAt: string;
  rewardAmountWei: string | null;
  dappProgress: number | null;
  collapsedProgress: boolean;
  friendWallet: string | null;
  readAt: string | null;
};

export type InviteNotificationHistoryResponse = {
  items?: InviteNotificationHistoryItem[];
  unreadCount?: number;
  nextCursor?: string | null;
  error?: string;
};
