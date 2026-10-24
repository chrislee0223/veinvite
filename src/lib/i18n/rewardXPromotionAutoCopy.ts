import type { SupportedLocale } from './locales';
import { REWARD_X_PROMOTION_AUTO_CORE } from './rewardXPromotionAutoCore';
import { REWARD_X_PROMOTION_AUTO_EXPANDED } from './rewardXPromotionAutoExpanded';

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
  ...REWARD_X_PROMOTION_AUTO_CORE,
  ...REWARD_X_PROMOTION_AUTO_EXPANDED,
};
