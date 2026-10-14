'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { SupportedLocale } from '@/lib/i18n/locales';
import {
  notifyRewardClaimSessionInvalid,
} from '@/lib/rewards/rewardClaimClient';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';
import {
  rewardReceiptShareLabel,
  rewardReceiptXIntentUrl,
} from '@/lib/rewards/rewardReceiptShare';

const PROMOTION_SHARE_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PROMOTION_REFERRAL_PATH_PATTERN =
  /^\/s\/(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})\/?$/u;

type PromotionState =
  | 'OPEN'
  | 'SUBMISSION_GRACE'
  | 'VERIFYING'
  | 'RETENTION'
  | 'REVIEW_REQUIRED'
  | 'PAYOUT_PENDING'
  | 'PAID'
  | 'EXPIRED'
  | 'RELEASED';

export type RewardXPromotionPreview = {
  inviteCode: string;
  state: PromotionState;
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

type PromotionResponse = {
  promotion?: RewardXPromotionPreview | null;
  error?: string;
};

type PromotionSubmitResponse = {
  error?: string;
  verification?: {
    state?: string;
    retryable?: boolean;
    reason?: string;
  };
};

function promotionCopy(locale: SupportedLocale) {
  if (locale === 'ko') {
    return {
      title: 'X Promotion',
      open: '24시간 안에 X에 공유하면 받을 수 있어요.',
      grace: '이미 게시했다면 X 게시물 링크를 확인해 주세요.',
      verifying: 'X 게시물을 확인하고 있어요.',
      retention: '게시물 유지 여부를 확인하고 있어요.',
      review: '확인이 지연되고 있어요. 자동으로 다시 확인합니다.',
      payoutPending: '확인 완료 · 보상 지급 대기 중',
      paid: 'X Promotion 보상 지급 완료',
      ended: 'X Promotion 기회가 종료되었어요.',
      inputLabel: 'X 게시물 링크',
      inputPlaceholder: 'https://x.com/.../status/...',
      verify: '게시물 링크 확인',
      verifyingButton: '확인 중…',
      retry: '다시 시도해 주세요.',
      shareUnavailable: '공유 링크를 준비하고 있어요. 잠시 후 다시 열어 주세요.',
    };
  }

  return {
    title: 'X Promotion',
    open: 'Share on X within 24 hours to qualify.',
    grace: 'If you already posted, verify the X Post URL now.',
    verifying: 'Checking your X Post.',
    retention: 'Checking that the Post remains available.',
    review: 'Verification is delayed. VeInvite will retry automatically.',
    payoutPending: 'Verified · payout pending',
    paid: 'X Promotion reward paid',
    ended: 'This X Promotion opportunity has ended.',
    inputLabel: 'X Post URL',
    inputPlaceholder: 'https://x.com/.../status/...',
    verify: 'Verify Post URL',
    verifyingButton: 'Verifying…',
    retry: 'Please try again.',
    shareUnavailable: 'The promotion share link is still loading. Reopen this receipt shortly.',
  };
}

function buildPromotionShareUrl(
  rewardShareUrl: string,
  shareToken: string | null,
): string {
  if (
    !shareToken ||
    !PROMOTION_SHARE_TOKEN_PATTERN.test(
      shareToken.toLowerCase(),
    )
  ) {
    return '';
  }

  try {
    const url = new URL(rewardShareUrl);

    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !==
        'veinvite.vercel.app' ||
      !PROMOTION_REFERRAL_PATH_PATTERN.test(
        url.pathname,
      )
    ) {
      return '';
    }

    url.searchParams.set(
      'xp',
      shareToken.toLowerCase(),
    );
    return url.toString();
  } catch {
    return '';
  }
}

async function readJson<T>(
  response: Response,
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

async function loadPromotion(
  inviteCode: string,
  signal?: AbortSignal,
): Promise<RewardXPromotionPreview | null> {
  const response = await fetch(
    `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(inviteCode)}`,
    {
      cache: 'no-store',
      signal,
    },
  );

  const body =
    await readJson<PromotionResponse>(
      response,
    );

  if (response.status === 401) {
    notifyRewardClaimSessionInvalid();
  }

  if (!response.ok) {
    throw new Error(
      body.error ||
        'The X promotion state could not be loaded.',
    );
  }

  return body.promotion ?? null;
}

export function RewardReceiptXPromotionActions({
  locale,
  receipt,
  rewardShareUrl,
  onRewardShare,
  previewPromotion,
}: {
  locale: SupportedLocale;
  receipt: RewardReceipt;
  rewardShareUrl: string;
  onRewardShare?: (intentUrl: string) => void;
  previewPromotion?: RewardXPromotionPreview | null;
}) {
  const copy = promotionCopy(locale);
  const inputId = useId();
  const [promotion, setPromotion] =
    useState<RewardXPromotionPreview | null>(null);
  const [lookupSucceeded, setLookupSucceeded] =
    useState(false);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState('');
  const [postUrl, setPostUrl] =
    useState('');
  const [submitting, setSubmitting] =
    useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    requestRef.current += 1;

    if (previewPromotion !== undefined) {
      setPromotion(previewPromotion);
      setLookupSucceeded(true);
      setLoading(false);
      setError('');
      setPostUrl('');
      setSubmitting(false);
      return;
    }
    const requestId = requestRef.current;
    const controller = new AbortController();

    setPromotion(null);
    setLookupSucceeded(false);
    setLoading(true);
    setError('');
    setPostUrl('');
    setSubmitting(false);

    void loadPromotion(
      receipt.inviteCode,
      controller.signal,
    )
      .then((next) => {
        if (requestRef.current !== requestId) {
          return;
        }
        setPromotion(next);
        setLookupSucceeded(true);
      })
      .catch((loadError) => {
        if (
          controller.signal.aborted ||
          requestRef.current !== requestId
        ) {
          return;
        }
        console.warn(
          'VeInvite X promotion state load failed:',
          loadError,
        );
        setError(copy.retry);
      })
      .finally(() => {
        if (requestRef.current === requestId) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    receipt.id,
    receipt.inviteCode,
    copy.retry,
    previewPromotion,
  ]);

  const promotionShareUrl = useMemo(
    () =>
      promotion?.state === 'OPEN'
        ? buildPromotionShareUrl(
            rewardShareUrl,
            promotion.shareToken,
          )
        : '',
    [
      promotion?.state,
      promotion?.shareToken,
      rewardShareUrl,
    ],
  );

  const genericShareIntentUrl =
    rewardShareUrl
      ? rewardReceiptXIntentUrl({
          locale,
          amountB3tr: receipt.amountB3tr,
          referralUrl: rewardShareUrl,
        })
      : '';

  const promotionShareIntentUrl =
    promotionShareUrl
      ? rewardReceiptXIntentUrl({
          locale,
          amountB3tr: receipt.amountB3tr,
          referralUrl: promotionShareUrl,
        })
      : '';

  const openShare = (
    intentUrl: string,
  ) => {
    if (!intentUrl) return;

    if (onRewardShare) {
      onRewardShare(intentUrl);
      return;
    }

    window.open(
      intentUrl,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const submitPost = async () => {
    if (
      previewPromotion !== undefined ||
      submitting ||
      !postUrl.trim()
    ) {
      return;
    }

    const inviteCode =
      receipt.inviteCode;
    const requestId =
      requestRef.current;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(
        '/api/rewards/x-promotion/submit',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            inviteCode,
            postUrl: postUrl.trim(),
          }),
        },
      );

      const body =
        await readJson<PromotionSubmitResponse>(
          response,
        );

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        notifyRewardClaimSessionInvalid();
      }

      if (
        !response.ok &&
        response.status !== 202
      ) {
        throw new Error(
          body.error ||
            'The X Post could not be verified.',
        );
      }

      const next =
        await loadPromotion(inviteCode);

      if (
        requestRef.current !== requestId
      ) {
        return;
      }

      setPromotion(next);
      setLookupSucceeded(true);
      setPostUrl('');
    } catch (submitError) {
      console.warn(
        'VeInvite X promotion Post submission failed:',
        submitError,
      );
      setError(
        submitError instanceof Error &&
          submitError.message
          ? submitError.message
          : copy.retry,
      );
    } finally {
      if (requestRef.current === requestId) {
        setSubmitting(false);
      }
    }
  };

  const canSubmit =
    promotion?.state === 'OPEN' ||
    promotion?.state ===
      'SUBMISSION_GRACE';

  const showGenericShare =
    lookupSucceeded &&
    (
      !promotion ||
      promotion.state === 'PAID' ||
      promotion.state === 'EXPIRED' ||
      promotion.state === 'RELEASED'
    );

  const statusText =
    promotion?.state === 'OPEN'
      ? copy.open
      : promotion?.state ===
          'SUBMISSION_GRACE'
        ? copy.grace
        : promotion?.state ===
            'VERIFYING'
          ? copy.verifying
          : promotion?.state ===
              'RETENTION'
            ? copy.retention
            : promotion?.state ===
                'REVIEW_REQUIRED'
              ? copy.review
              : promotion?.state ===
                  'PAYOUT_PENDING'
                ? copy.payoutPending
                : promotion?.state ===
                    'PAID'
                  ? copy.paid
                  : promotion
                    ? copy.ended
                    : '';

  if (loading) {
    return (
      <p
        className="promotionLoading"
        aria-live="polite"
      >
        X Promotion…
        <style jsx>{`
          .promotionLoading{margin:12px 0 0;color:#777168;font-size:.59rem}
        `}</style>
      </p>
    );
  }

  return (
    <>
      {promotion ? (
        <section
          className="promotionCard"
          aria-live="polite"
        >
          <div className="promotionHeading">
            <strong>{copy.title}</strong>
            <span>
              +{promotion.amountB3tr} B3TR
            </span>
          </div>

          <p>{statusText}</p>

          {promotion.state === 'OPEN' ? (
            promotionShareIntentUrl ? (
              <button
                type="button"
                className="promotionShare"
                onClick={() =>
                  openShare(
                    promotionShareIntentUrl,
                  )
                }
              >
                {rewardReceiptShareLabel(locale)}
                {' · +'}
                {promotion.amountB3tr} B3TR
              </button>
            ) : (
              <p className="promotionWarning">
                {copy.shareUnavailable}
              </p>
            )
          ) : null}

          {canSubmit ? (
            <div className="promotionSubmit">
              <label htmlFor={inputId}>
                {copy.inputLabel}
              </label>
              <input
                id={inputId}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={500}
                value={postUrl}
                placeholder={
                  copy.inputPlaceholder
                }
                onChange={(event) =>
                  setPostUrl(
                    event.currentTarget.value,
                  )
                }
              />
              <button
                type="button"
                disabled={
                  submitting ||
                  postUrl.trim().length === 0
                }
                onClick={() =>
                  void submitPost()
                }
              >
                {submitting
                  ? copy.verifyingButton
                  : copy.verify}
              </button>
            </div>
          ) : null}

          {error ? (
            <p
              className="promotionError"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {showGenericShare &&
      genericShareIntentUrl ? (
        <button
          type="button"
          className="genericShare"
          aria-label={
            rewardReceiptShareLabel(locale)
          }
          onClick={() =>
            openShare(
              genericShareIntentUrl,
            )
          }
        >
          {rewardReceiptShareLabel(locale)}
        </button>
      ) : null}

      {!promotion && error ? (
        <p
          className="promotionStandaloneError"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <style jsx>{`
        .promotionCard{margin-top:14px;padding:13px;border:1px solid rgba(255,205,80,.18);border-radius:14px;background:rgba(244,183,40,.045)}
        .promotionHeading{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .promotionHeading strong{color:#fff6d0;font-size:.72rem}
        .promotionHeading span{color:#ffd04a;font-size:.69rem;font-weight:950;font-variant-numeric:tabular-nums}
        .promotionCard>p{margin:7px 0 0;color:#aaa399;font-size:.62rem;line-height:1.5}
        .promotionShare,.genericShare{width:100%;min-height:42px;margin-top:11px;padding:9px 12px;border:1px solid rgba(255,255,255,.16);border-radius:11px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.7rem;font-weight:950;cursor:pointer}
        .genericShare{min-height:44px;margin-top:14px;font-size:.75rem}
        .promotionSubmit{display:grid;gap:7px;margin-top:10px}
        .promotionSubmit label{color:#8e887e;font-size:.56rem;font-weight:850}
        .promotionSubmit input{width:100%;min-height:40px;box-sizing:border-box;padding:9px 10px;border:1px solid rgba(255,255,255,.11);border-radius:10px;background:#0d0e0c;color:#e9e5de;font:inherit;font-size:.66rem;direction:ltr;text-align:left;outline:none}
        .promotionSubmit input:focus{border-color:rgba(255,205,80,.5);box-shadow:0 0 0 2px rgba(255,205,80,.08)}
        .promotionSubmit button{width:100%;min-height:40px;border:1px solid rgba(255,205,80,.2);border-radius:10px;background:rgba(244,183,40,.09);color:#f1cf65;font:inherit;font-size:.66rem;font-weight:900;cursor:pointer}
        .promotionSubmit button:disabled{opacity:.5;cursor:not-allowed}
        .promotionError,.promotionStandaloneError{margin:8px 0 0!important;color:#d48b93!important;font-size:.6rem!important}
        .promotionWarning{color:#c9a95b!important}
        .promotionShare:focus-visible,.genericShare:focus-visible,.promotionSubmit button:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
      `}</style>
    </>
  );
}
