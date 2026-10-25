import type { RewardXPromotionCopy } from './rewardXPromotionCopy';

export type RewardXPromotionAutoCopy = Required<
  Pick<
    RewardXPromotionCopy,
    | 'connectX'
    | 'connectedX'
    | 'autoConnectBody'
    | 'autoOpenBody'
    | 'autoShareFollowupBody'
    | 'autoGraceBody'
    | 'autoConnectedX'
  >
>;
