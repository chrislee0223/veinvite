import type { SupportedLocale } from './locales';
import { REWARD_X_PROMOTION_AUTO_CORE_COPY } from './rewardXPromotionAutoCopyCore';
import { REWARD_X_PROMOTION_AUTO_EXPANDED_COPY } from './rewardXPromotionAutoCopyExpanded';
import type { RewardXPromotionAutoCopy } from './rewardXPromotionAutoCopyTypes';

export const REWARD_X_PROMOTION_AUTO_COPY = {
  ...REWARD_X_PROMOTION_AUTO_CORE_COPY,
  ...REWARD_X_PROMOTION_AUTO_EXPANDED_COPY,
} satisfies Record<SupportedLocale, RewardXPromotionAutoCopy>;
