'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  getLocaleDirection,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { REWARD_X_PROMOTION_AUTO_COPY } from '@/lib/i18n/rewardXPromotionAutoCopy';
import { REWARD_X_PROMOTION_COPY } from '@/lib/i18n/rewardXPromotionCopy';
import { rewardXPromotionSubmitError } from '@/lib/i18n/rewardXPromotionSubmitErrorCopy';
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
  xConnectAvailable?: boolean;
  xConnected?: boolean;
  xUrlLessEnabled?: boolean;
  promotion?: Promotion | null;
  error?: string;
};

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
  const copy = REWARD_X_PROMOTION_COPY[locale];
  const autoCopy = REWARD_X_PROMOTION_AUTO_COPY[locale];
  const direction = getLocaleDirection(locale);
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
  const requestSequenceRef = useRef(0);

  const load = useCallback(async () => {
    // State requests can overlap (timers, focus, manual verification). The
    // most recently started request alone may update this receipt's UI.
    const requestSequence = ++requestSequenceRef.current;
    try {
      const response = await fetch(
        `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(inviteCode)}`,
        {
          cache: 'no-store',
        },
      );
      const body =
        (await response.json()) as PromotionResponse;

      if (requestSequence !== requestSequenceRef.current) return;

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
      if (requestSequence === requestSequenceRef.current) {
        setLoadError(true);
      }
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [inviteCode]);

  useEffect(() => {
    setState(null);
    setLoading(true);
    setLoadError(false);
    setPostUrl('');
    setSubmitError('');
    void load();
    return () => {
      // A prior invite's response must not revive its share token/status
      // after the panel is unmounted or its invite identity changes.
      requestSequenceRef.current += 1;
    };
  }, [load]);

  const promotion = state?.promotion ?? null;
  const poll =
    state?.promotionPending === true ||
    [
      'VERIFYING',
      'RETENTION',
      'REVIEW_REQUIRED',
      'PAYOUT_PENDING',
    ].includes(promotion?.state ?? '');

  useEffect(() => {
    if (!poll) return;

    const timer = window.setInterval(
      () => void load(),
      30_000,
    );

    return () => window.clearInterval(timer);
  }, [load, poll]);

  // An open receipt may stay mounted past the 24-hour post deadline.
  // Refresh at each state boundary rather than polling every 30 seconds for
  // a full day or showing an already-expired share button indefinitely.
  useEffect(() => {
    if (
      !promotion ||
      !['OPEN', 'SUBMISSION_GRACE'].includes(promotion.state)
    ) {
      return;
    }

    const postDeadline = Date.parse(promotion.postDeadlineAt);
    if (!Number.isFinite(postDeadline)) return;

    const transitionAt =
      promotion.state === 'OPEN'
        ? postDeadline
        : postDeadline + promotion.submissionGraceSeconds * 1000;
    const delayMs = Math.max(
      1_000,
      Math.min(transitionAt - Date.now() + 1_000, 86_401_000),
    );
    const timer = window.setTimeout(
      () => void load(),
      delayMs,
    );

    return () => window.clearTimeout(timer);
  }, [
    load,
    promotion?.state,
    promotion?.postDeadlineAt,
    promotion?.submissionGraceSeconds,
  ]);

  const genericShareIntent = useMemo(() => {
    if (
      loading ||
      loadError ||
      promotion ||
      state?.promotionPending === true ||
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
    state?.promotionPending,
  ]);

  const promotionShareIntent = useMemo(() => {
    if (
      promotion?.state !== 'OPEN' ||
      (state?.xUrlLessEnabled === true && state?.xConnected !== true) ||
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
    state?.xUrlLessEnabled,
    state?.xConnected,
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
      if (response.status === 401 || response.status === 403) {
        notifyRewardClaimSessionInvalid();
      }

      if (!response.ok && response.status !== 202) {
        setSubmitError(
          rewardXPromotionSubmitError(locale, response.status),
        );
        return;
      }

      setPostUrl('');
      await load();
    } catch {
      setSubmitError(
        rewardXPromotionSubmitError(locale, 0),
      );
    } finally {
      setSubmitting(false);
    }
  }, [inviteCode, load, locale, postUrl, submitting]);

  if (loading) {
    return null;
  }

  if (loadError) {
    return (
      <div className="promotionStatus" lang={locale} dir={direction}>
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
          .promotionStatus{min-width:0;margin-top:14px;padding:12px;border:1px solid rgba(255,205,80,.12);border-radius:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;color:#9f998f;font-size:.62rem;overflow-wrap:break-word}
          .promotionStatus>span{min-width:0;flex:1 1 150px;overflow-wrap:anywhere}
          .promotionRetry{max-width:100%;min-height:34px;padding:7px 10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.04);color:#ddd5c7;font:inherit;font-size:.61rem;font-weight:850;line-height:1.35;white-space:normal;overflow-wrap:anywhere;text-align:center;cursor:pointer}
        `}</style>
      </div>
    );
  }

  if (!promotion) {
    if (state?.promotionPending === true) {
      return (
        <div className="promotionPreparing" lang={locale} dir={direction}>
          {copy.preparingBody}
          <style jsx>{`
            .promotionPreparing{min-width:0;margin-top:14px;padding:11px 12px;border:1px solid rgba(255,205,80,.12);border-radius:12px;background:rgba(255,205,80,.03);color:#a9a196;font-size:.62rem;line-height:1.55;overflow-wrap:break-word}
          `}</style>
        </div>
      );
    }

    if (!genericShareIntent) return null;

    return (
      <button
        type="button"
        className="genericShare"
        lang={locale}
        dir={direction}
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
          .genericShare{width:100%;min-width:0;min-height:44px;margin-top:14px;padding:10px 14px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.75rem;font-weight:950;line-height:1.35;white-space:normal;overflow-wrap:anywhere;text-align:center;cursor:pointer}
          .genericShare:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        `}</style>
      </button>
    );
  }

  const canSubmit =
    promotion.state === 'OPEN' ||
    promotion.state === 'SUBMISSION_GRACE';
  const usesAuto = state?.xUrlLessEnabled === true;

  const body =
    promotion.state === 'OPEN'
      ? usesAuto
        ? state?.xConnected
          ? autoCopy.autoOpenBody
          : autoCopy.autoConnectBody
        : copy.openBody
      : promotion.state === 'SUBMISSION_GRACE'
        ? usesAuto
          ? autoCopy.autoGraceBody
          : copy.graceBody
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
    <section className="promotionPanel" lang={locale} dir={direction}>
      <div className="promotionHeading">
        <strong>{copy.title}</strong>
        <span dir="ltr">+{promotion.amountB3tr} B3TR</span>
      </div>
      <p>{body}</p>

      {promotionShareIntent ? (
        <button
          type="button"
          className="promotionShare"
          onClick={() => {
            // Backgrounded tabs can delay expiry timers. Recheck against
            // the immutable server-issued deadline on the actual click.
            if (Date.now() >= Date.parse(promotion.postDeadlineAt)) {
              void load();
              return;
            }
            openIntent(
              promotionShareIntent,
              onRewardShare,
            );
          }}
        >
          <span>{rewardReceiptShareLabel(locale)}</span>
          <b dir="ltr">+{promotion.amountB3tr} B3TR</b>
        </button>
      ) : null}

      {promotion.state === 'OPEN' && state?.xConnectAvailable ? (
        state.xConnected ? (
          <p className="promotionConnectState" role="status">
            {usesAuto
              ? autoCopy.autoConnectedX
              : autoCopy.connectedX}
          </p>
        ) : (
          <button
            type="button"
            className="promotionConnect"
            onClick={() => {
              window.location.assign(
                `/api/rewards/x-promotion/x-connect/start?inviteCode=${encodeURIComponent(inviteCode)}`,
              );
            }}
          >
            {autoCopy.connectX}
          </button>
        )
      ) : null}

      {canSubmit && !usesAuto ? (
        <div className="promotionSubmit">
          <input
            type="url"
            dir="ltr"
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
        .promotionPanel{min-width:0;margin-top:14px;padding:13px;border:1px solid rgba(255,205,80,.18);border-radius:14px;background:rgba(255,205,80,.035)}
        .promotionHeading{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:8px 12px}
        .promotionHeading strong{min-width:0;color:#f3e6bd;font-size:.7rem;line-height:1.4;overflow-wrap:anywhere;text-wrap:balance}
        .promotionHeading span{min-width:0;color:#ffd04a;font-size:.68rem;font-weight:950;font-variant-numeric:tabular-nums;white-space:nowrap;unicode-bidi:isolate}
        .promotionPanel p{min-width:0;margin:8px 0 0;color:#9f998f;font-size:.62rem;line-height:1.55;overflow-wrap:break-word}
        .promotionShare{width:100%;min-width:0;min-height:44px;margin-top:12px;padding:10px 14px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.72rem;font-weight:950;line-height:1.35;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:3px 6px;white-space:normal;text-align:center;overflow-wrap:anywhere}
        .promotionShare b{font:inherit;font-weight:950;white-space:nowrap;unicode-bidi:isolate}
        .promotionConnect{width:100%;min-width:0;min-height:42px;margin-top:10px;padding:9px 12px;border:1px solid rgba(255,205,80,.35);border-radius:11px;background:rgba(244,183,40,.10);color:#f1cf65;font:inherit;font-size:.7rem;font-weight:900;line-height:1.35;white-space:normal;overflow-wrap:anywhere;text-align:center;cursor:pointer}
        .promotionConnectState{margin-top:10px;color:#a6d5a5!important;overflow-wrap:anywhere}
        .promotionConnect:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        .promotionSubmit{min-width:0;margin-top:9px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}
        .promotionSubmit input{min-width:0;width:100%;height:42px;box-sizing:border-box;padding:9px 10px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(0,0,0,.25);color:#eee8dd;font:inherit;font-size:.64rem;direction:ltr;text-align:left}
        .promotionSubmit button{min-width:0;min-height:42px;padding:8px 11px;border:1px solid rgba(255,205,80,.18);border-radius:11px;background:rgba(244,183,40,.08);color:#f1cf65;font:inherit;font-size:.64rem;font-weight:900;line-height:1.3;cursor:pointer;white-space:normal;overflow-wrap:anywhere;text-align:center}
        .promotionSubmit button:disabled{opacity:.45;cursor:not-allowed}
        .promotionError{color:#d48b93!important;overflow-wrap:anywhere}
        .promotionShare:focus-visible,.promotionSubmit input:focus-visible,.promotionSubmit button:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        @media(max-width:430px){.promotionSubmit{grid-template-columns:1fr}.promotionSubmit button{width:100%}}
      `}</style>
    </section>
  );
}
