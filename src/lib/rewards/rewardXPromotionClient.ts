import type { SupportedLocale } from '@/lib/i18n/locales';

export type RewardXPromotionState =
  | 'OPEN'
  | 'SUBMISSION_GRACE'
  | 'VERIFYING'
  | 'RETENTION'
  | 'REVIEW_REQUIRED'
  | 'PAYOUT_PENDING'
  | 'PAID'
  | 'EXPIRED'
  | 'RELEASED';

export type RewardXPromotion = {
  inviteCode: string;
  state: RewardXPromotionState;
  amountWei: string;
  amountB3tr: string;
  openedAt: string | null;
  postDeadlineAt: string;
  submissionGraceSeconds: number;
  shareToken: string | null;
  shareUrl: string | null;
  submittedAt: string | null;
  verifyAfter: string | null;
  paidAt: string | null;
};

export type RewardXPromotionResponse = {
  newOffersEnabled: boolean;
  promotion: RewardXPromotion | null;
  error?: string;
};

export type RewardXPromotionSubmitResponse = {
  submission?: unknown;
  verification?: {
    inviteCode?: string;
    postId?: string;
    state?: string;
    retryable?: boolean;
    samePostRetryable?: boolean;
    reason?: string;
    verifyAfter?: string | null;
  };
  error?: string;
};

type RewardXPromotionCopy = {
  title: string;
  openBody: string;
  shareCta: (amount: string) => string;
  postUrlPlaceholder: string;
  submitPost: string;
  submittingPost: string;
  graceBody: string;
  verifyingBody: string;
  retentionBody: string;
  reviewBody: string;
  payoutPendingBody: string;
  paidBody: (amount: string) => string;
  expiredBody: string;
  releasedBody: string;
  unavailableBody: string;
  retry: string;
  submitFailed: string;
};

const EN: RewardXPromotionCopy = {
  title: 'X promotion bonus',
  openBody:
    'Share on X before the deadline, then submit the public Post link here.',
  shareCta: (amount) => `Share on X · +${amount} B3TR`,
  postUrlPlaceholder: 'Paste X Post URL',
  submitPost: 'Check Post',
  submittingPost: 'Checking…',
  graceBody:
    'The posting window ended. You can still submit a Post created before the deadline.',
  verifyingBody: 'Checking your X Post.',
  retentionBody:
    'Post verified. Keep it public until the 24-hour check.',
  reviewBody:
    'Verification needs another check. Your bonus remains on hold.',
  payoutPendingBody:
    'Post verified. Bonus payout is processing.',
  paidBody: (amount) => `+${amount} B3TR bonus paid`,
  expiredBody: 'The X promotion window expired.',
  releasedBody:
    'The unused X promotion amount was released back to the reward pool.',
  unavailableBody:
    'X bonus status is temporarily unavailable.',
  retry: 'Retry',
  submitFailed:
    'We could not verify that X Post right now.',
};

const KO: RewardXPromotionCopy = {
  title: 'X 홍보 보너스',
  openBody:
    '마감 전에 X에 게시한 뒤 공개 게시물 링크를 여기에서 확인해 주세요.',
  shareCta: (amount) => `X에 공유 · +${amount} B3TR`,
  postUrlPlaceholder: 'X 게시물 링크 붙여넣기',
  submitPost: '게시물 확인',
  submittingPost: '확인 중…',
  graceBody:
    '게시 가능 시간은 끝났어요. 마감 전에 올린 게시물 링크는 아직 제출할 수 있어요.',
  verifyingBody: 'X 게시물을 확인하고 있어요.',
  retentionBody:
    '게시물이 확인됐어요. 24시간 확인 시점까지 공개 상태를 유지해 주세요.',
  reviewBody:
    '추가 확인이 필요해요. 보너스는 그대로 보류 중이에요.',
  payoutPendingBody:
    '게시물 확인이 끝났어요. 보너스 지급을 처리 중이에요.',
  paidBody: (amount) => `+${amount} B3TR 보너스 지급 완료`,
  expiredBody: 'X 홍보 보너스 참여 시간이 종료됐어요.',
  releasedBody:
    '사용하지 않은 X 홍보 보너스는 보상 재원으로 반환됐어요.',
  unavailableBody:
    'X 보너스 상태를 잠시 확인할 수 없어요.',
  retry: '다시 확인',
  submitFailed:
    '지금은 X 게시물을 확인할 수 없어요. 다시 시도해 주세요.',
};

const COPY: Partial<
  Record<SupportedLocale, RewardXPromotionCopy>
> = {
  en: EN,
  ko: KO,
};

export function rewardXPromotionCopy(
  locale: SupportedLocale,
): RewardXPromotionCopy {
  return COPY[locale] ?? EN;
}

const VALID_STATES =
  new Set<RewardXPromotionState>([
    'OPEN',
    'SUBMISSION_GRACE',
    'VERIFYING',
    'RETENTION',
    'REVIEW_REQUIRED',
    'PAYOUT_PENDING',
    'PAID',
    'EXPIRED',
    'RELEASED',
  ]);

function nullableString(value: unknown): string | null {
  return value === null || typeof value === 'string'
    ? value
    : null;
}

export function parseRewardXPromotionResponse(
  value: unknown,
): RewardXPromotionResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.newOffersEnabled !== 'boolean') {
    return null;
  }

  if (record.promotion === null) {
    return {
      newOffersEnabled: record.newOffersEnabled,
      promotion: null,
    };
  }

  if (
    !record.promotion ||
    typeof record.promotion !== 'object' ||
    Array.isArray(record.promotion)
  ) {
    return null;
  }

  const promotion =
    record.promotion as Record<string, unknown>;
  const state =
    typeof promotion.state === 'string'
      ? promotion.state as RewardXPromotionState
      : null;

  if (
    !state ||
    !VALID_STATES.has(state) ||
    typeof promotion.inviteCode !== 'string' ||
    typeof promotion.amountWei !== 'string' ||
    !/^\d+$/u.test(promotion.amountWei) ||
    typeof promotion.amountB3tr !== 'string' ||
    promotion.amountB3tr.length < 1 ||
    typeof promotion.postDeadlineAt !== 'string' ||
    !Number.isFinite(Date.parse(promotion.postDeadlineAt)) ||
    typeof promotion.submissionGraceSeconds !== 'number' ||
    !Number.isSafeInteger(promotion.submissionGraceSeconds) ||
    promotion.submissionGraceSeconds < 0
  ) {
    return null;
  }

  const shareToken =
    nullableString(promotion.shareToken);
  const shareUrl =
    nullableString(promotion.shareUrl);

  if (state === 'OPEN') {
    const tokenPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
    const shareUrlPattern =
      /^https:\/\/veinvite\.vercel\.app\/s\/(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})\?xp=([0-9a-f-]{36})$/u;

    const match =
      shareUrl?.match(shareUrlPattern);

    if (
      !shareToken ||
      !tokenPattern.test(shareToken) ||
      !match ||
      match[1] !== shareToken
    ) {
      return null;
    }
  }

  return {
    newOffersEnabled: record.newOffersEnabled,
    promotion: {
      inviteCode: promotion.inviteCode,
      state,
      amountWei: promotion.amountWei,
      amountB3tr: promotion.amountB3tr,
      openedAt: nullableString(promotion.openedAt),
      postDeadlineAt: promotion.postDeadlineAt,
      submissionGraceSeconds:
        promotion.submissionGraceSeconds,
      shareToken,
      shareUrl,
      submittedAt:
        nullableString(promotion.submittedAt),
      verifyAfter:
        nullableString(promotion.verifyAfter),
      paidAt: nullableString(promotion.paidAt),
    },
  };
}
