import type { SupportedLocale } from './locales';

export type RewardXPromotionCopy = {
  shareAndEarn: (amount: string) => string;
  offerHint: string;
  postUrlPlaceholder: string;
  verifyPost: string;
  verifying: string;
  retention: (amount: string) => string;
  reviewRequired: string;
  payoutPending: (amount: string) => string;
  paid: (amount: string) => string;
  expired: string;
  released: string;
  submitError: string;
  submitted: string;
};

const EN: RewardXPromotionCopy = {
  shareAndEarn: (amount) =>
    `Share on X · +${amount} B3TR`,
  offerHint:
    'Post within 24 hours. The same public post must still be available 24 hours after verification.',
  postUrlPlaceholder: 'Paste your X Post URL',
  verifyPost: 'Verify Post',
  verifying:
    'Checking your X Post. You can close this screen.',
  retention: (amount) =>
    `Post verified. Keep it public for 24 hours to receive +${amount} B3TR automatically.`,
  reviewRequired:
    'Verification is delayed. VeInvite will retry automatically.',
  payoutPending: (amount) =>
    `Verification complete · +${amount} B3TR payment pending`,
  paid: (amount) =>
    `+${amount} B3TR paid`,
  expired:
    'The X promotion submission window has ended.',
  released:
    'This X promotion opportunity is no longer available.',
  submitError:
    'The X Post could not be verified right now.',
  submitted:
    'Post submitted for verification.',
};

const KO: RewardXPromotionCopy = {
  shareAndEarn: (amount) =>
    `X에 공유하고 +${amount} B3TR`,
  offerHint:
    '24시간 안에 게시해 주세요. 확인된 동일 게시물이 24시간 후에도 공개 상태여야 합니다.',
  postUrlPlaceholder: 'X 게시물 링크 붙여넣기',
  verifyPost: '게시물 링크 확인',
  verifying:
    'X 게시물을 확인 중입니다. 이 화면을 닫아도 괜찮아요.',
  retention: (amount) =>
    `게시물이 확인됐어요. 24시간 후에도 공개 상태면 +${amount} B3TR가 자동 지급됩니다.`,
  reviewRequired:
    '확인이 지연되고 있습니다. VeInvite가 자동으로 다시 확인합니다.',
  payoutPending: (amount) =>
    `조건 확인 완료 · +${amount} B3TR 지급 처리 중`,
  paid: (amount) =>
    `+${amount} B3TR 지급 완료`,
  expired:
    'X 공유 보너스 제출 시간이 종료되었습니다.',
  released:
    '이 X 공유 보너스 기회는 종료되었습니다.',
  submitError:
    '지금은 X 게시물을 확인할 수 없습니다.',
  submitted:
    '게시물을 확인 대상으로 등록했습니다.',
};

export function rewardXPromotionCopy(
  locale: SupportedLocale,
): RewardXPromotionCopy {
  return locale === 'ko' ? KO : EN;
}
