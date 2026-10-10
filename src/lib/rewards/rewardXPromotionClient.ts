import type { SupportedLocale } from '@/lib/i18n/locales';
import { rewardReceiptXIntentUrl } from '@/lib/rewards/rewardReceiptShare';

const SHARE_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

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
  submittedAt: string | null;
  verifyAfter: string | null;
  paidAt: string | null;
};

type RewardXPromotionResponse = {
  newOffersEnabled?: boolean;
  promotion?: RewardXPromotion | null;
  error?: string;
};

export function buildRewardXPromotionShareUrl({
  rewardShareUrl,
  shareToken,
}: {
  rewardShareUrl: string;
  shareToken: string;
}): string {
  if (!SHARE_TOKEN_PATTERN.test(shareToken.toLowerCase())) {
    throw new Error('Invalid X promotion share token.');
  }

  const url = new URL(rewardShareUrl);
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'veinvite.vercel.app'
  ) {
    throw new Error('Invalid VeInvite reward share URL.');
  }

  url.searchParams.set('xpromo', shareToken.toLowerCase());
  return url.toString();
}

export function buildRewardXPromotionIntentUrl({
  locale,
  baseRewardAmountB3tr,
  rewardShareUrl,
  shareToken,
}: {
  locale: SupportedLocale;
  baseRewardAmountB3tr: string;
  rewardShareUrl: string;
  shareToken: string;
}): string {
  return rewardReceiptXIntentUrl({
    locale,
    amountB3tr: baseRewardAmountB3tr,
    referralUrl: buildRewardXPromotionShareUrl({
      rewardShareUrl,
      shareToken,
    }),
  });
}

export async function loadRewardXPromotion(
  inviteCode: string,
): Promise<RewardXPromotion | null> {
  const response = await fetch(
    `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(inviteCode)}`,
    {
      cache: 'no-store',
    },
  );

  const body =
    (await response.json()) as RewardXPromotionResponse;

  if (!response.ok) {
    throw new Error(
      body.error || 'X promotion state could not be loaded.',
    );
  }

  return body.promotion ?? null;
}

export async function submitRewardXPromotionPost({
  inviteCode,
  postUrl,
}: {
  inviteCode: string;
  postUrl: string;
}): Promise<{
  state: 'INITIAL_VERIFIED' | 'PENDING';
  verifyAfter: string | null;
}> {
  const response = await fetch(
    '/api/rewards/x-promotion/submit',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inviteCode,
        postUrl,
      }),
      cache: 'no-store',
    },
  );

  const body = (await response.json()) as {
    error?: string;
    verification?: {
      state?: string;
      verifyAfter?: string | null;
    };
  };

  if (!response.ok && response.status !== 202) {
    throw new Error(
      body.error || 'X promotion Post could not be verified.',
    );
  }

  const state =
    body.verification?.state === 'INITIAL_VERIFIED'
      ? 'INITIAL_VERIFIED'
      : 'PENDING';

  return {
    state,
    verifyAfter:
      typeof body.verification?.verifyAfter === 'string'
        ? body.verification.verifyAfter
        : null,
  };
}
