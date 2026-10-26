import type { SupportedLocale } from './locales';
import { REWARD_X_PROMOTION_AUTO_COPY_A } from './rewardXPromotionAutoCopyA';
import { REWARD_X_PROMOTION_AUTO_COPY_B } from './rewardXPromotionAutoCopyB';

export type RewardXPromotionAutoCopy = {
  connectX: string;
  connectedX: string;
  autoConnectBody: string;
  autoOpenBody: string;
  autoShareFollowupBody: string;
  autoGraceBody: string;
  autoConnectedX: string;
};

export const REWARD_X_PROMOTION_AUTO_COPY: Record<
  SupportedLocale,
  RewardXPromotionAutoCopy
> = {
  ...REWARD_X_PROMOTION_AUTO_COPY_A,
  ...REWARD_X_PROMOTION_AUTO_COPY_B,
};
