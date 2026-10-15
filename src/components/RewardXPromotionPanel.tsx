'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { SupportedLocale } from '@/lib/i18n/locales';
import {
  rewardReceiptShareLabel,
  rewardReceiptXIntentUrl,
  rewardXPromotionShareUrl,
} from '@/lib/rewards/rewardReceiptShare';
import {
  notifyRewardClaimSessionInvalid,
} from '@/lib/rewards/rewardClaimClient';

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

type Promotion = {
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
  newOffersEnabled?: boolean;
  promotionPending?: boolean;
  promotion?: Promotion | null;
  error?: string;
};

type PromotionSubmitResponse = {
  verification?: {
    state?: string;
    retryable?: boolean;
    reason?: string;
  };
  error?: string;
};

type Copy = {
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
  verify: string;
  verifying: string;
  retry: string;
};

const EN_COPY: Copy = {
  title: 'X Promotion Bonus',
  openBody:
    'Share on X within 24 hours, then paste the public Post link below. The same Post must still be public at the 24-hour check.',
  graceBody:
    'The sharing window has ended. If you already posted in time, paste that Post link now.',
  verifyingBody:
    'We are checking your X Post. Your promotion amount remains reserved.',
  retentionBody:
    'Post confirmed. Keep the same Post public until the 24-hour check completes.',
  reviewBody:
    'Verification needs another review. Your promotion amount remains reserved.',
  payoutBody:
    'Verification is complete. Your promotion payout is being prepared.',
  paidBody:
    'Your X promotion bonus has been paid.',
  expiredBody:
    'The X promotion submission window has expired.',
  releasedBody:
    'This promotion amount was released back to the reward pool.',
  preparingBody:
    'Your X promotion opportunity is being prepared. Check this reward receipt again shortly.',
  postUrlPlaceholder: 'https://x.com/.../status/...',
  verify: 'Verify Post',
  verifying: 'Checking…',
  retry: 'Try again',
};

const KO_COPY: Copy = {
  title: 'X 프로모션 보너스',
  openBody:
    '24시간 안에 X에 공유한 뒤 공개 게시물 링크를 아래에 붙여 주세요. 같은 게시물이 24시간 확인 시점에도 공개 상태여야 해요.',
  graceBody:
    '공유 가능 시간은 끝났어요. 시간 안에 이미 게시했다면 지금 그 게시물 링크를 붙여 주세요.',
  verifyingBody:
    'X 게시물을 확인 중이에요. 프로모션 금액은 그대로 보류돼 있어요.',
  retentionBody:
    '게시물이 확인됐어요. 24시간 확인이 끝날 때까지 같은 게시물을 공개 상태로 유지해 주세요.',
  reviewBody:
    '추가 확인이 필요해요. 프로모션 금액은 그대로 보류돼 있어요.',
  payoutBody:
    '확인이 완료됐어요. 프로모션 보상을 지급 준비 중이에요.',
  paidBody:
    'X 프로모션 보상이 지급됐어요.',
  expiredBody:
    'X 프로모션 게시물 제출 시간이 만료됐어요.',
  releasedBody:
    '이 프로모션 금액은 보상 풀로 반환됐어요.',
  preparingBody:
    'X 프로모션 기회를 준비 중이에요. 잠시 후 이 보상 내역을 다시 확인해 주세요.',
  postUrlPlaceholder: 'https://x.com/.../status/...',
  verify: '게시물 확인',
  verifying: '확인 중…',
  retry: '다시 확인',
};

function copyFor(locale: SupportedLocale): Copy {
  return locale === 'ko' ? KO_COPY : EN_COPY;
}

function openIntent(
  intentUrl: string,
  onRewardShare?: (intentUrl: string) => void,
) {
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
}

export function RewardXPromotionPanel({
  locale,
  inviteCode,
  receiptAmountB3tr,
  rewardShareUrl,
  onRewardShare,
}: {
  locale: SupportedLocale;
  inviteCode: string;
  receiptAmountB3tr: string;
  rewardShareUrl: string;
  onRewardShare?: (intentUrl: string) => void;
}) {
  const copy = copyFor(locale);
  const [state, setState] =
    useState<PromotionResponse | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [loadError, setLoadError] =
    useState(false);
  const [postUrl, setPostUrl] =
    useState('');
  const [submitting, setSubmitting] =
    useState(false);
  const [submitError, setSubmitError] =
    useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(inviteCode)}`,
        {
          cache: 'no-store',
        },
      );
      const body =
        (await response.json()) as PromotionResponse;

      if (response.status === 401 || response.status === 403) {
        notifyRewardClaimSessionInvalid();
      }

      if (!response.ok) {
        throw new Error(
          body.error ||
          'X promotion state unavailable.',
        );
      }

      setState(body);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [inviteCode]);

  useEffect(() => {
    setState(null);
    setLoading(true);
    setLoadError(false);
    setPostUrl('');
    setSubmitError('');
    void load();
  }, [load]);

  const promotion = state?.promotion ?? null;
  const poll =
    state?.newOffersEnabled === true &&
    (
      state?.promotionPending === true ||
      [
        'VERIFYING',
        'RETENTION',
        'REVIEW_REQUIRED',
        'PAYOUT_PENDING',
      ].includes(promotion.state)
    );

  useEffect(() => {
    if (!poll) return;

    const timer = window.setInterval(
      () => void load(),
      30_000,
    );

    return () => window.clearInterval(timer);
  }, [load, poll]);

  const genericShareIntent = useMemo(() => {
    if (
      loading ||
      loadError ||
      promotion ||
      state?.newOffersEnabled !== false ||
      !rewardShareUrl
    ) {
      return '';
    }

    return rewardReceiptXIntentUrl({
      locale,
      amountB3tr: receiptAmountB3tr,
      referralUrl: rewardShareUrl,
    });
  }, [
    loadError,
    loading,
    locale,
    promotion,
    receiptAmountB3tr,
    rewardShareUrl,
    state?.newOffersEnabled,
  ]);

  const promotionShareIntent = useMemo(() => {
    if (
      promotion?.state !== 'OPEN' ||
      !promotion.shareToken ||
      !rewardShareUrl
    ) {
      return '';
    }

    const promotionUrl =
      rewardXPromotionShareUrl({
        referralUrl: rewardShareUrl,
        shareToken: promotion.shareToken,
      });

    if (!promotionUrl) return '';

    return rewardReceiptXIntentUrl({
      locale,
      amountB3tr: receiptAmountB3tr,
      referralUrl: promotionUrl,
    });
  }, [
    locale,
    promotion,
    receiptAmountB3tr,
    rewardShareUrl,
  ]);

  const submitPost = useCallback(async () => {
    const normalized = postUrl.trim();

    if (!normalized || submitting) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch(
        '/api/rewards/x-promotion/submit',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inviteCode,
            postUrl: normalized,
          }),
        },
      );
      const body =
        (await response.json()) as PromotionSubmitResponse;

      if (response.status === 401 || response.status === 403) {
        notifyRewardClaimSessionInvalid();
      }

      if (!response.ok && response.status !== 202) {
        throw new Error(
          body.error ||
          'The X Post could not be verified.',
        );
      }

      setPostUrl('');
      await load();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'The X Post could not be verified.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [inviteCode, load, postUrl, submitting]);

  if (loading) {
    return null;
  }

  if (loadError) {
    return (
      <div className="promotionStatus">
        <span>{copy.title}</span>
        <button
          type="button"
          className="promotionRetry"
          onClick={() => {
            setLoading(true);
            void load();
          }}
        >
          {copy.retry}
        </button>
        <style jsx>{`
          .promotionStatus{margin-top:14px;padding:12px;border:1px solid rgba(255,205,80,.12);border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#9f998f;font-size:.62rem}
          .promotionRetry{min-height:34px;padding:7px 10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.04);color:#ddd5c7;font:inherit;font-size:.61rem;font-weight:850;cursor:pointer}
        `}</style>
      </div>
    );
  }

  if (!promotion) {
    if (
      state?.newOffersEnabled === true &&
      state?.promotionPending === true
    ) {
      return (
        <div className="promotionPreparing">
          {copy.preparingBody}
          <style jsx>{`
            .promotionPreparing{margin-top:14px;padding:11px 12px;border:1px solid rgba(255,205,80,.12);border-radius:12px;background:rgba(255,205,80,.03);color:#a9a196;font-size:.62rem;line-height:1.5}
          `}</style>
        </div>
      );
    }

    if (!genericShareIntent) return null;

    return (
      <button
        type="button"
        className="genericShare"
        aria-label={rewardReceiptShareLabel(locale)}
        onClick={() =>
          openIntent(
            genericShareIntent,
            onRewardShare,
          )
        }
      >
        {rewardReceiptShareLabel(locale)}
        <style jsx>{`
          .genericShare{width:100%;min-height:44px;margin-top:14px;padding:10px 14px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.75rem;font-weight:950;cursor:pointer}
          .genericShare:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        `}</style>
      </button>
    );
  }

  const canSubmit =
    promotion.state === 'OPEN' ||
    promotion.state === 'SUBMISSION_GRACE';

  const body =
    promotion.state === 'OPEN'
      ? copy.openBody
      : promotion.state === 'SUBMISSION_GRACE'
        ? copy.graceBody
        : promotion.state === 'VERIFYING'
          ? copy.verifyingBody
          : promotion.state === 'RETENTION'
            ? copy.retentionBody
            : promotion.state === 'REVIEW_REQUIRED'
              ? copy.reviewBody
              : promotion.state === 'PAYOUT_PENDING'
                ? copy.payoutBody
                : promotion.state === 'PAID'
                  ? copy.paidBody
                  : promotion.state === 'RELEASED'
                    ? copy.releasedBody
                    : copy.expiredBody;

  return (
    <section className="promotionPanel">
      <div className="promotionHeading">
        <strong>{copy.title}</strong>
        <span>+{promotion.amountB3tr} B3TR</span>
      </div>
      <p>{body}</p>

      {promotionShareIntent ? (
        <button
          type="button"
          className="promotionShare"
          onClick={() =>
            openIntent(
              promotionShareIntent,
              onRewardShare,
            )
          }
        >
          {rewardReceiptShareLabel(locale)} · +{promotion.amountB3tr} B3TR
        </button>
      ) : null}

      {canSubmit ? (
        <div className="promotionSubmit">
          <input
            type="url"
            value={postUrl}
            placeholder={copy.postUrlPlaceholder}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) =>
              setPostUrl(event.target.value)
            }
          />
          <button
            type="button"
            disabled={
              submitting ||
              postUrl.trim().length === 0
            }
            onClick={() => void submitPost()}
          >
            {submitting
              ? copy.verifying
              : copy.verify}
          </button>
        </div>
      ) : null}

      {submitError ? (
        <p className="promotionError" role="alert">
          {submitError}
        </p>
      ) : null}

      <style jsx>{`
        .promotionPanel{margin-top:14px;padding:13px;border:1px solid rgba(255,205,80,.18);border-radius:14px;background:rgba(255,205,80,.035)}
        .promotionHeading{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .promotionHeading strong{color:#f3e6bd;font-size:.7rem}
        .promotionHeading span{flex:0 0 auto;color:#ffd04a;font-size:.68rem;font-weight:950;font-variant-numeric:tabular-nums}
        .promotionPanel p{margin:8px 0 0;color:#9f998f;font-size:.62rem;line-height:1.5}
        .promotionShare{width:100%;min-height:44px;margin-top:12px;padding:10px 14px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.72rem;font-weight:950;cursor:pointer}
        .promotionSubmit{margin-top:9px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}
        .promotionSubmit input{min-width:0;height:42px;box-sizing:border-box;padding:9px 10px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(0,0,0,.25);color:#eee8dd;font:inherit;font-size:.64rem;direction:ltr;text-align:left}
        .promotionSubmit button{min-height:42px;padding:8px 11px;border:1px solid rgba(255,205,80,.18);border-radius:11px;background:rgba(244,183,40,.08);color:#f1cf65;font:inherit;font-size:.64rem;font-weight:900;cursor:pointer}
        .promotionSubmit button:disabled{opacity:.45;cursor:not-allowed}
        .promotionError{color:#d48b93!important}
        .promotionShare:focus-visible,.promotionSubmit input:focus-visible,.promotionSubmit button:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        @media(max-width:380px){.promotionSubmit{grid-template-columns:1fr}.promotionSubmit button{width:100%}}
      `}</style>
    </section>
  );
}
