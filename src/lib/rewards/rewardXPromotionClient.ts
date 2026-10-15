const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/u;
const SHARE_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REFERRAL_KEY_PATTERN =
  /^(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})$/u;

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

const PROMOTION_STATES =
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

export type RewardXPromotionSnapshot = {
  newOffersEnabled: boolean;
  promotion: RewardXPromotion | null;
};

function optionalIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error('X promotion returned an invalid timestamp.');
  }
  return new Date(value).toISOString();
}

function requiredIso(value: unknown): string {
  const parsed = optionalIso(value);
  if (!parsed) {
    throw new Error('X promotion returned a missing timestamp.');
  }
  return parsed;
}

export async function loadRewardXPromotionState(
  inviteCode: string,
): Promise<RewardXPromotionSnapshot> {
  const normalized =
    inviteCode.trim().toUpperCase();

  if (!INVITE_CODE_PATTERN.test(normalized)) {
    throw new Error('Invalid X promotion invite code.');
  }

  const response = await fetch(
    `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(normalized)}`,
    { cache: 'no-store' },
  );

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A malformed response is handled below as unavailable.
  }

  if (!response.ok) {
    throw new Error(
      'X promotion state is temporarily unavailable.',
    );
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new Error('X promotion state is malformed.');
  }

  const body = payload as Record<string, unknown>;

  if (typeof body.newOffersEnabled !== 'boolean') {
    throw new Error('X promotion runtime state is malformed.');
  }

  if (body.promotion === null) {
    return {
      newOffersEnabled: body.newOffersEnabled,
      promotion: null,
    };
  }

  if (
    !body.promotion ||
    typeof body.promotion !== 'object' ||
    Array.isArray(body.promotion)
  ) {
    throw new Error('X promotion record is malformed.');
  }

  const promotion =
    body.promotion as Record<string, unknown>;
  const state =
    promotion.state as RewardXPromotionState;
  const amountWei =
    String(promotion.amountWei ?? '');
  const amountB3tr =
    String(promotion.amountB3tr ?? '');
  const shareToken =
    promotion.shareToken === null
      ? null
      : String(promotion.shareToken ?? '').toLowerCase();
  const grace =
    Number(promotion.submissionGraceSeconds);

  if (
    !PROMOTION_STATES.has(state) ||
    String(promotion.inviteCode ?? '') !== normalized ||
    !/^\d+$/u.test(amountWei) ||
    BigInt(amountWei) < 1n ||
    !amountB3tr ||
    !Number.isSafeInteger(grace) ||
    grace < 0 ||
    (shareToken !== null &&
      !SHARE_TOKEN_PATTERN.test(shareToken))
  ) {
    throw new Error('X promotion record is malformed.');
  }

  return {
    newOffersEnabled: body.newOffersEnabled,
    promotion: {
      inviteCode: normalized,
      state,
      amountWei,
      amountB3tr,
      openedAt: optionalIso(promotion.openedAt),
      postDeadlineAt:
        requiredIso(promotion.postDeadlineAt),
      submissionGraceSeconds: grace,
      shareToken,
      submittedAt:
        optionalIso(promotion.submittedAt),
      verifyAfter:
        optionalIso(promotion.verifyAfter),
      paidAt:
        optionalIso(promotion.paidAt),
    },
  };
}

export function buildRewardXPromotionReferralUrl(
  referralUrl: string,
  shareToken: string,
): string {
  const token = shareToken.trim().toLowerCase();

  if (!SHARE_TOKEN_PATTERN.test(token)) {
    throw new Error('Invalid X promotion share token.');
  }

  const url = new URL(referralUrl);

  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !==
      'veinvite.vercel.app'
  ) {
    throw new Error(
      'X promotion requires the production VeInvite share URL.',
    );
  }

  const match =
    /^\/s\/([^/?#]+)\/?$/u.exec(url.pathname);

  if (
    !match ||
    !REFERRAL_KEY_PATTERN.test(match[1])
  ) {
    throw new Error(
      'X promotion requires a permanent VeInvite referral link.',
    );
  }

  url.searchParams.set('xp', token);
  return url.toString();
}
