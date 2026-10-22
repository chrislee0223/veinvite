import type { SupportedLocale } from './locales';
import type {
  RewardXPromotionAutoCopy,
} from './rewardXPromotionCopyTypes';
import {
  REWARD_X_PROMOTION_AUTO_CORE_COPY,
} from './rewardXPromotionAutoCopyCore';
import {
  REWARD_X_PROMOTION_AUTO_EXPANDED_COPY,
} from './rewardXPromotionAutoCopyExpanded';

export const REWARD_X_PROMOTION_AUTO_COPY = {
  ...REWARD_X_PROMOTION_AUTO_CORE_COPY,
  ...REWARD_X_PROMOTION_AUTO_EXPANDED_COPY,
} satisfies Record<SupportedLocale, RewardXPromotionAutoCopy>;
