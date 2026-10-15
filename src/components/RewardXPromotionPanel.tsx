'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  rewardXPromotionCopy,
} from '@/lib/i18n/rewardXPromotionCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';
import {
  formatRewardShareAmount,
  rewardReceiptShareLabel,
  rewardReceiptXIntentUrl,
} from '@/lib/rewards/rewardReceiptShare';
import {
  buildRewardXPromotionReferralUrl,
  loadRewardXPromotionState,
  type RewardXPromotion,
  type RewardXPromotionSnapshot,
} from '@/lib/rewards/rewardXPromotionClient';

const ACTIVE_REFRESH_MS = 60_000;

function statusText(
  promotion: RewardXPromotion,
  locale: SupportedLocale,
): string {
  const copy = rewardXPromotionCopy(locale);
  const amount =
    formatRewardShareAmount(
      promotion.amountB3tr,
    );

  switch (promotion.state) {
    case 'OPEN':
      return copy.offerHint;
    case 'SUBMISSION_GRACE':
      return copy.offerHint;
    case 'VERIFYING':
      return copy.verifying;
    case 'RETENTION':
      return copy.retention(amount);
    case 'REVIEW_REQUIRED':
      return copy.reviewRequired;
    case 'PAYOUT_PENDING':
      return copy.payoutPending(amount);
    case 'PAID':
      return copy.paid(amount);
    case 'EXPIRED':
      return copy.expired;
    case 'RELEASED':
      return copy.released;
  }
}

function opensWindow(
  intentUrl: string,
  onRewardShare?: (intentUrl: string) => void,
) {
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
  receipt,
  rewardShareUrl,
  onRewardShare,
}: {
  locale: SupportedLocale;
  receipt: RewardReceipt;
  rewardShareUrl: string;
  onRewardShare?: (intentUrl: string) => void;
}) {
  const copy = rewardXPromotionCopy(locale);
  const [
    snapshot,
    setSnapshot,
  ] = useState<RewardXPromotionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [stateError, setStateError] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const [submitting, setSubmitting] =
    useState(false);
  const [submitMessage, setSubmitMessage] =
    useState('');
  const [submitError, setSubmitError] =
    useState('');

  const refresh = useCallback(async () => {
    try {
      const next =
        await loadRewardXPromotionState(
          receipt.inviteCode,
        );
      setSnapshot(next);
      setStateError(false);
      return next;
    } catch {
      setStateError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [receipt.inviteCode]);

  useEffect(() => {
    setSnapshot(null);
    setLoading(true);
    setStateError(false);
    setPostUrl('');
    setSubmitMessage('');
    setSubmitError('');
    void refresh();
  }, [refresh]);

  const promotion = snapshot?.promotion ?? null;

  useEffect(() => {
    if (
      !promotion ||
      ['PAID', 'EXPIRED', 'RELEASED'].includes(
        promotion.state,
      )
    ) {
      return;
    }

    const timer = window.setInterval(
      () => void refresh(),
      ACTIVE_REFRESH_MS,
    );

    return () => window.clearInterval(timer);
  }, [promotion, refresh]);

  const genericIntentUrl = useMemo(
    () =>
      rewardShareUrl
        ? rewardReceiptXIntentUrl({
            locale,
            amountB3tr: receipt.amountB3tr,
            referralUrl: rewardShareUrl,
          })
        : '',
    [
      locale,
      receipt.amountB3tr,
      rewardShareUrl,
    ],
  );

  const promotionIntentUrl = useMemo(() => {
    if (
      !promotion ||
      promotion.state !== 'OPEN' ||
      !promotion.shareToken ||
      !rewardShareUrl
    ) {
      return '';
    }

    try {
      return rewardReceiptXIntentUrl({
        locale,
        amountB3tr: receipt.amountB3tr,
        referralUrl:
          buildRewardXPromotionReferralUrl(
            rewardShareUrl,
            promotion.shareToken,
          ),
      });
    } catch {
      return '';
    }
  }, [
    locale,
    promotion,
    receipt.amountB3tr,
    rewardShareUrl,
  ]);

  const submitPost = useCallback(async () => {
    if (
      !promotion ||
      !['OPEN', 'SUBMISSION_GRACE'].includes(
        promotion.state,
      ) ||
      submitting
    ) {
      return;
    }

    const value = postUrl.trim();
    if (!value) {
      setSubmitError(copy.submitError);
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitMessage('');

    try {
      const response = await fetch(
        '/api/rewards/x-promotion/submit',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inviteCode: receipt.inviteCode,
            postUrl: value,
          }),
        },
      );

      const body = await response
        .json()
        .catch(() => null) as
          | { error?: string }
          | null;

      if (!response.ok) {
        setSubmitError(
          body?.error || copy.submitError,
        );
        return;
      }

      setSubmitMessage(copy.submitted);
      await refresh();
    } catch {
      setSubmitError(copy.submitError);
    } finally {
      setSubmitting(false);
    }
  }, [
    copy.submitError,
    copy.submitted,
    postUrl,
    promotion,
    receipt.inviteCode,
    refresh,
    submitting,
  ]);

  if (loading) {
    return null;
  }

  // If the promotion state is temporarily unreadable, hide the share
  // action rather than risk creating a normal Post that is missing the
  // promotion token for an otherwise active opportunity.
  if (stateError) {
    return null;
  }

  if (!promotion) {
    return genericIntentUrl ? (
      <button
        type="button"
        className="rewardXShare"
        aria-label={rewardReceiptShareLabel(locale)}
        onClick={() =>
          opensWindow(
            genericIntentUrl,
            onRewardShare,
          )
        }
      >
        {rewardReceiptShareLabel(locale)}
        <style jsx>{`
          .rewardXShare{width:100%;min-height:44px;margin-top:14px;padding:10px 14px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.75rem;font-weight:950;cursor:pointer}
          .rewardXShare:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        `}</style>
      </button>
    ) : null;
  }

  const amount =
    formatRewardShareAmount(
      promotion.amountB3tr,
    );
  const canSubmit =
    promotion.state === 'OPEN' ||
    promotion.state === 'SUBMISSION_GRACE';

  return (
    <section
      className="promotionPanel"
      aria-live="polite"
    >
      {promotionIntentUrl ? (
        <button
          type="button"
          className="promotionShare"
          onClick={() =>
            opensWindow(
              promotionIntentUrl,
              onRewardShare,
            )
          }
        >
          {copy.shareAndEarn(amount)}
        </button>
      ) : null}

      <p className="promotionStatus">
        {statusText(promotion, locale)}
      </p>

      {canSubmit ? (
        <div className="promotionSubmit">
          <input
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            value={postUrl}
            placeholder={
              copy.postUrlPlaceholder
            }
            aria-label={
              copy.postUrlPlaceholder
            }
            onChange={(event) => {
              setPostUrl(event.target.value);
              setSubmitError('');
              setSubmitMessage('');
            }}
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitPost()}
          >
            {copy.verifyPost}
          </button>
        </div>
      ) : null}

      {submitMessage ? (
        <p className="promotionResult">
          {submitMessage}
        </p>
      ) : null}
      {submitError ? (
        <p
          className="promotionError"
          role="alert"
        >
          {submitError}
        </p>
      ) : null}

      <style jsx>{`
        .promotionPanel{margin-top:14px;padding:12px;border:1px solid rgba(255,205,80,.16);border-radius:13px;background:rgba(255,205,80,.035)}
        .promotionShare{width:100%;min-height:44px;padding:10px 14px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.75rem;font-weight:950;cursor:pointer}
        .promotionStatus{margin:9px 2px 0;color:#b8b1a7;font-size:.64rem;font-weight:700;line-height:1.5;word-break:keep-all;overflow-wrap:break-word}
        .promotionSubmit{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:10px}
        .promotionSubmit input{min-width:0;height:42px;box-sizing:border-box;padding:0 11px;border:1px solid rgba(255,255,255,.11);border-radius:10px;background:#11120f;color:#eee9df;font:inherit;font-size:.65rem;outline:none}
        .promotionSubmit input:focus{border-color:rgba(255,205,80,.55)}
        .promotionSubmit button{min-height:42px;padding:0 11px;border:1px solid rgba(255,205,80,.22);border-radius:10px;background:rgba(244,183,40,.1);color:#f1cf65;font:inherit;font-size:.64rem;font-weight:900;cursor:pointer}
        .promotionSubmit button:disabled{opacity:.45;cursor:not-allowed}
        .promotionResult,.promotionError{margin:8px 2px 0;font-size:.61rem;font-weight:750;line-height:1.45}
        .promotionResult{color:#89d8b1}
        .promotionError{color:#d48b93}
        .promotionShare:focus-visible,.promotionSubmit button:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        @media(max-width:380px){.promotionSubmit{grid-template-columns:1fr}.promotionSubmit button{width:100%}}
      `}</style>
    </section>
  );
}
