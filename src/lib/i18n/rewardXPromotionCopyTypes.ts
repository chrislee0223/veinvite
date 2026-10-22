export type RewardXPromotionCopy = {
  title: string;
  openBody: string;
  graceBody: string;
  verifyingBody: string;
  retentionBody: string;
  reviewBody: string;
  payoutBody: string;
  paidBody: string;
  expiredBody: string;
  releasedBody: string;
  preparingBody: string;
  postUrlPlaceholder: string;
  shareFollowupBody: string;
  verify: string;
  verifying: string;
  retry: string;
  connectX?: string;
  connectedX?: string;
  autoConnectBody?: string;
  autoOpenBody?: string;
  autoGraceBody?: string;
  autoConnectedX?: string;
};

export type RewardXPromotionAutoCopy = Required<
  Pick<
    RewardXPromotionCopy,
    | 'connectX'
    | 'connectedX'
    | 'autoConnectBody'
    | 'autoOpenBody'
    | 'autoGraceBody'
    | 'autoConnectedX'
  >
>;
