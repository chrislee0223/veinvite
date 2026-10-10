const PRODUCTION_ORIGIN = 'https://veinvite.vercel.app';
const REFERRAL_PATH_PATTERN = /^\/s\/(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})\/?$/u;
const SHARE_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

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

export type RewardXPromotionSnapshot = {
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

export function buildRewardXPromotionShareUrl(
  referralUrl: string,
  shareToken: string,
): string | null {
  let url: URL;

  try {
    url = new URL(referralUrl);
  } catch {
    return null;
  }

  const token = shareToken.trim().toLowerCase();

  if (
    url.origin !== PRODUCTION_ORIGIN ||
    !REFERRAL_PATH_PATTERN.test(url.pathname) ||
    url.search !== '' ||
    url.hash !== '' ||
    !SHARE_TOKEN_PATTERN.test(token)
  ) {
    return null;
  }

  url.searchParams.set('xp', token);
  return url.toString();
}

export function isRewardXPromotionState(
  value: unknown,
): value is RewardXPromotionState {
  return [
    'OPEN',
    'SUBMISSION_GRACE',
    'VERIFYING',
    'RETENTION',
    'REVIEW_REQUIRED',
    'PAYOUT_PENDING',
    'PAID',
    'EXPIRED',
    'RELEASED',
  ].includes(String(value));
}

export function parseRewardXPromotionSnapshot(
  value: unknown,
): RewardXPromotionSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const state = row.state;

  if (
    typeof row.inviteCode !== 'string' ||
    !/^[A-HJ-NP-Z2-9]{7}$/u.test(row.inviteCode) ||
    !isRewardXPromotionState(state) ||
    typeof row.amountWei !== 'string' ||
    !/^\d+$/u.test(row.amountWei) ||
    BigInt(row.amountWei) < 1n ||
    typeof row.amountB3tr !== 'string' ||
    typeof row.postDeadlineAt !== 'string' ||
    Number.isNaN(Date.parse(row.postDeadlineAt)) ||
    !Number.isSafeInteger(row.submissionGraceSeconds) ||
    Number(row.submissionGraceSeconds) < 0
  ) {
    return null;
  }

  const optionalIso = (candidate: unknown): string | null => {
    if (candidate === null || candidate === undefined) return null;
    if (typeof candidate !== 'string' || Number.isNaN(Date.parse(candidate))) {
      return null;
    }
    return new Date(candidate).toISOString();
  };

  const shareToken =
    row.shareToken === null || row.shareToken === undefined
      ? null
      : typeof row.shareToken === 'string' &&
          SHARE_TOKEN_PATTERN.test(row.shareToken.toLowerCase())
        ? row.shareToken.toLowerCase()
        : null;

  if (state === 'OPEN' && !shareToken) {
    return null;
  }

  return {
    inviteCode: row.inviteCode,
    state,
    amountWei: row.amountWei,
    amountB3tr: row.amountB3tr,
    openedAt: optionalIso(row.openedAt),
    postDeadlineAt: new Date(row.postDeadlineAt).toISOString(),
    submissionGraceSeconds: Number(row.submissionGraceSeconds),
    shareToken,
    submittedAt: optionalIso(row.submittedAt),
    verifyAfter: optionalIso(row.verifyAfter),
    paidAt: optionalIso(row.paidAt),
  };
}
