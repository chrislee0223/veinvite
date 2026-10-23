import type { SupportedLocale } from './locales';
import { REWARD_X_PROMOTION_EXPANDED_AUTO_COPY } from './rewardXPromotionExpandedAutoCopy';

export type RewardXPromotionAutoCopy = {
  connectX: string;
  connectedX: string;
  autoConnectBody: string;
  autoOpenBody: string;
  autoGraceBody: string;
  autoConnectedX: string;
  autoShareFollowupBody: string;
};

const REWARD_X_PROMOTION_PRIMARY_AUTO_COPY = {
  en: {
    connectX: 'Connect X account',
    connectedX: 'X account connected. You can still submit the post link while automatic checks are being tested.',
    autoConnectBody: 'Connect your public X account first. Then share the post within 24 hours. No post URL is needed.',
    autoOpenBody: 'Share to X within 24 hours. VeInvite will look for the post automatically. Keep it public for at least 24 hours; the bonus is paid only after verification.',
    autoGraceBody: 'The sharing window has ended. VeInvite is checking posts shared before the deadline automatically. Keep your post public until the 24-hour verification finishes.',
    autoConnectedX: 'X account connected. Your public post will be checked automatically; no link submission is needed.',
    autoShareFollowupBody: 'Your X post will be checked automatically. No URL submission is needed. Keep the post public until the 24-hour verification finishes.',
  },
  ko: {
    connectX: 'X 계정 연결',
    connectedX: 'X 계정이 연결됐어요. 자동 검증이 준비되는 동안에는 게시물 링크를 직접 제출할 수도 있어요.',
    autoConnectBody: '먼저 공개 X 계정을 연결해 주세요. 그런 다음 24시간 안에 공유하면 게시물 URL을 따로 제출할 필요가 없어요.',
    autoOpenBody: '24시간 안에 X에 공유해 주세요. VeInvite가 공개 게시물을 자동으로 찾아요. 24시간 이상 공개 상태를 유지하면 검증 후 추가 보상이 지급돼요.',
    autoGraceBody: '공유 가능 시간이 끝났어요. VeInvite가 기한 안에 게시된 글을 자동 확인 중이에요. 24시간 검증이 끝날 때까지 게시물을 공개 상태로 유지해 주세요.',
    autoConnectedX: 'X 계정이 연결됐어요. 공개 게시물은 자동 확인되므로 링크를 제출하지 않아도 돼요.',
    autoShareFollowupBody: 'VeInvite가 X 게시물을 자동으로 확인해요. URL을 따로 제출할 필요는 없어요. 24시간 검증이 끝날 때까지 게시물을 공개 상태로 유지해 주세요.',
  },
  zh: {
    connectX: '连接 X 账号',
    connectedX: 'X 账号已连接。自动验证测试期间仍可手动提交帖文链接。',
    autoConnectBody: '请先连接你的公开 X 账号，然后在 24 小时内分享。无需提交帖文 URL。',
    autoOpenBody: '请在 24 小时内分享到 X。VeInvite 会自动查找公开帖文。请至少保持公开 24 小时，验证通过后才会发放奖励。',
    autoGraceBody: '分享时间已结束。VeInvite 正在自动检查截止时间前发布的帖文。请保持帖文公开，直到 24 小时验证完成。',
    autoConnectedX: 'X 账号已连接。公开帖文会自动检查，无需提交链接。',
    autoShareFollowupBody: 'VeInvite 会自动检查你的 X 帖文，无需提交 URL。请保持帖文公开，直到 24 小时验证完成。',
  },
} satisfies Record<
  | 'en'
  | 'ko'
  | 'zh'
  | 'es'
  | 'ja'
  | 'it'
  | 'tr'
  | 'nl'
  | 'de'
  | 'fr'
  | 'pt'
  | 'ru'
  | 'id'
  | 'vi'
  | 'zh-tw',
  RewardXPromotionAutoCopy
>;

export const REWARD_X_PROMOTION_AUTO_COPY: Record<
  SupportedLocale,
  RewardXPromotionAutoCopy
> = {
  ...REWARD_X_PROMOTION_PRIMARY_AUTO_COPY,
  ...REWARD_X_PROMOTION_EXPANDED_AUTO_COPY,
};
