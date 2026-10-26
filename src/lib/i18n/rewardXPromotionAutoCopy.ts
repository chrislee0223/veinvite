import type { SupportedLocale } from './locales';
import { REWARD_X_PROMOTION_AUTO_CORE_COPY } from './rewardXPromotionAutoCoreCopy';
import { REWARD_X_PROMOTION_AUTO_EXPANDED_COPY } from './rewardXPromotionAutoExpandedCopy';

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
  ...REWARD_X_PROMOTION_AUTO_CORE_COPY,
  ...REWARD_X_PROMOTION_AUTO_EXPANDED_COPY,
};
