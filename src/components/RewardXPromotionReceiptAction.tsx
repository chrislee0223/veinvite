'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { SupportedLocale } from '@/lib/i18n/locales';
import { REWARD_X_PROMOTION_COPY } from '@/lib/i18n/rewardXPromotionCopy';
import {
  formatRewardShareAmount,
  rewardReceiptShareLabel,
} from '@/lib/rewards/rewardReceiptShare';
import {
  buildRewardXPromotionIntentUrl,
  loadRewardXPromotion,
  submitRewardXPromotionPost,
  type RewardXPromotionSnapshot,
} from '@/lib/rewards/rewardXPromotionClient';

export function RewardXPromotionReceiptAction({
  locale,
  inviteCode,
  baseRewardAmountB3tr,
  rewardShareUrl,
  ordinaryShareIntentUrl,
  onShare,
}: {
  locale: SupportedLocale;
  inviteCode: string;
  baseRewardAmountB3tr: string;
  rewardShareUrl: string;
  ordinaryShareIntentUrl: string;
  onShare?: (intentUrl: string) => void;
}) {
  const promotionCopy =
    REWARD_X_PROMOTION_COPY[locale];
  const requestIdRef = useRef(0);
  const [snapshot, setSnapshot] =
    useState<RewardXPromotionSnapshot | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const openIntent = useCallback((intentUrl: string) => {
    if (!intentUrl) return;
    if (onShare) {
      onShare(intentUrl);
      return;
    }
    window.open(
      intentUrl,
      '_blank',
      'noopener,noreferrer',
    );
  }, [onShare]);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadFailed(false);

    try {
      const next = await loadRewardXPromotion(inviteCode);
      if (requestIdRef.current !== requestId) return;
      setSnapshot(next);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      console.warn(
        'VeInvite X promotion state load failed:',
        error,
      );
      setLoadFailed(true);
      setSnapshot({
        newOffersEnabled: false,
        offerStatus: 'DISABLED',
        pendingPromotionAmountWei: null,
        pendingPromotionAmountB3tr: null,
        promotion: null,
      });
    }
  }, [inviteCode]);

  useEffect(() => {
    setSnapshot(undefined);
    setPostUrl('');
    setSubmitError('');
    void refresh();

    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (loadFailed || !snapshot) return;

    const promotion =
      snapshot.promotion;
    const promotionState =
      promotion?.state ?? null;
    const now = Date.now();
    let delayMs: number | null = null;

    if (
      snapshot.offerStatus === 'PREPARING' ||
      promotionState === 'VERIFYING' ||
      promotionState === 'REVIEW_REQUIRED' ||
      promotionState === 'PAYOUT_PENDING'
    ) {
      delayMs = 30_000;
    } else if (
      promotion &&
      promotionState === 'OPEN'
    ) {
      delayMs = Math.max(
        1_000,
        Date.parse(promotion.postDeadlineAt) -
          now +
          1_000,
      );
    } else if (
      promotion &&
      promotionState === 'SUBMISSION_GRACE'
    ) {
      delayMs = Math.max(
        1_000,
        Date.parse(promotion.postDeadlineAt) +
          promotion.submissionGraceSeconds *
            1_000 -
          now +
          1_000,
      );
    } else if (
      promotion &&
      promotionState === 'RETENTION'
    ) {
      const verifyAfter =
        promotion.verifyAfter
          ? Date.parse(
              promotion.verifyAfter,
            )
          : Number.NaN;

      delayMs =
        Number.isFinite(verifyAfter) &&
        verifyAfter > now
          ? verifyAfter - now + 1_000
          : 60_000;
    }

    if (delayMs === null) return;

    const timer = window.setTimeout(
      () => void refresh(),
      Math.min(
        delayMs,
        2_147_000_000,
      ),
    );

    return () =>
      window.clearTimeout(timer);
  }, [
    loadFailed,
    refresh,
    snapshot,
  ]);

  const submitPost = useCallback(async () => {
    if (!postUrl.trim() || submitting) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      await submitRewardXPromotionPost({
        inviteCode,
        postUrl: postUrl.trim(),
      });
      setPostUrl('');
      await refresh();
    } catch (error) {
      console.warn(
        'VeInvite X promotion Post submission failed:',
        error,
      );
      setSubmitError(
        error instanceof Error
          ? error.message
          : promotionCopy.submitError,
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    promotionCopy.submitError,
    inviteCode,
    postUrl,
    refresh,
    submitting,
  ]);

  const ordinaryShare = () => (
    ordinaryShareIntentUrl ? (
      <button
        type="button"
        className="notificationXShare"
        onClick={() => openIntent(ordinaryShareIntentUrl)}
      >
        {rewardReceiptShareLabel(locale)}
        <style jsx>{styles}</style>
      </button>
    ) : null
  );

  // Preserve the existing visual shape while the optional promotion state
  // loads, but do not allow a generic token-less Post to race a LIVE offer.
  if (snapshot === undefined) {
    return ordinaryShareIntentUrl ? (
      <button
        type="button"
        className="notificationXShare"
        disabled
        aria-busy="true"
      >
        {rewardReceiptShareLabel(locale)}
        <style jsx>{styles}</style>
      </button>
    ) : null;
  }

  if (loadFailed) {
    return ordinaryShare();
  }

  const promotion = snapshot.promotion;

  if (!promotion) {
    if (snapshot.offerStatus === 'PREPARING') {
      const pendingAmount =
        snapshot.pendingPromotionAmountB3tr
          ? formatRewardShareAmount(
              snapshot.pendingPromotionAmountB3tr,
            )
          : null;

      return (
        <div
          className="promotionStatus"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <strong>
            {pendingAmount
              ? `X · +${pendingAmount} B3TR`
              : 'X · B3TR'}
          </strong>
          <style jsx>{styles}</style>
        </div>
      );
    }

    return ordinaryShare();
  }

  if (
    promotion.state === 'EXPIRED' ||
    promotion.state === 'RELEASED'
  ) {
    return ordinaryShare();
  }

  const promotionDisplayAmount =
    formatRewardShareAmount(promotion.amountB3tr);

  if (promotion.state === 'PAID') {
    return (
      <div className="promotionStatus paid" role="status">
        <strong>
          {promotionCopy.paid} · +{promotionDisplayAmount} B3TR
        </strong>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (promotion.state === 'RETENTION') {
    return (
      <div className="promotionStatus" role="status">
        <strong>{promotionCopy.retention}</strong>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (promotion.state === 'PAYOUT_PENDING') {
    return (
      <div className="promotionStatus" role="status">
        <strong>{promotionCopy.payoutPending}</strong>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (
    promotion.state === 'VERIFYING' ||
    promotion.state === 'REVIEW_REQUIRED'
  ) {
    return (
      <div className="promotionStatus" role="status">
        <strong>
          {promotion.state === 'VERIFYING'
            ? promotionCopy.verifying
            : promotionCopy.reviewRequired}
        </strong>
        <style jsx>{styles}</style>
      </div>
    );
  }

  const canOpenShare =
    promotion.state === 'OPEN' &&
    Boolean(promotion.shareToken) &&
    Boolean(rewardShareUrl);

  let promotionIntentUrl = '';
  if (canOpenShare && promotion.shareToken) {
    try {
      promotionIntentUrl =
        buildRewardXPromotionIntentUrl({
          locale,
          baseRewardAmountB3tr,
          rewardShareUrl,
          shareToken: promotion.shareToken,
        });
    } catch (error) {
      console.warn(
        'VeInvite X promotion share URL could not be built:',
        error,
      );
    }
  }

  return (
    <div className="promotionAction">
      {promotionIntentUrl ? (
        <button
          type="button"
          className="notificationXShare promotion"
          onClick={() => openIntent(promotionIntentUrl)}
        >
          {promotionCopy.shareBonus.replace(
            '{amount}',
            promotionDisplayAmount,
          )}
        </button>
      ) : null}

      <p>
        {promotion.state === 'SUBMISSION_GRACE'
          ? promotionCopy.graceHint
          : promotionCopy.openHint}
      </p>

      <div className="postSubmitRow">
        <input
          type="url"
          dir="ltr"
          spellCheck={false}
          value={postUrl}
          placeholder={promotionCopy.postUrlPlaceholder}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => {
            setPostUrl(event.target.value);
            setSubmitError('');
          }}
        />
        <button
          type="button"
          disabled={!postUrl.trim() || submitting}
          onClick={() => void submitPost()}
        >
          {submitting ? promotionCopy.submitting : promotionCopy.verifyPost}
        </button>
      </div>

      {submitError ? (
        <p className="promotionError" role="alert">
          {submitError}
        </p>
      ) : null}

      {loadFailed ? (
        <p className="promotionError" role="status">
          {promotionCopy.submitError}
        </p>
      ) : null}

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .notificationXShare{
    width:100%;
    min-height:44px;
    margin-top:14px;
    padding:10px 14px;
    border:1px solid rgba(255,255,255,.16);
    border-radius:12px;
    background:#f7f7f5;
    color:#0b0b0a;
    font:inherit;
    font-size:.75rem;
    font-weight:950;
    cursor:pointer
  }
  .notificationXShare:disabled{
    cursor:default;
    opacity:.58
  }
  .notificationXShare.promotion{
    border-color:rgba(255,205,80,.28)
  }
  .promotionAction{
    margin-top:14px;
    padding-top:1px
  }
  .promotionAction .notificationXShare{
    margin-top:0
  }
  .promotionAction>p{
    margin:8px 1px 0;
    color:#8f887f;
    font-size:.58rem;
    line-height:1.45;
    overflow-wrap:anywhere
  }
  .postSubmitRow{
    margin-top:9px;
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    gap:7px
  }
  .postSubmitRow input{
    min-width:0;
    min-height:40px;
    box-sizing:border-box;
    padding:8px 10px;
    border:1px solid rgba(255,255,255,.1);
    border-radius:10px;
    background:rgba(255,255,255,.035);
    color:#e5dfd5;
    font:inherit;
    font-size:.63rem
  }
  .postSubmitRow button{
    min-height:40px;
    padding:0 11px;
    border:1px solid rgba(255,205,80,.18);
    border-radius:10px;
    background:rgba(244,183,40,.08);
    color:#e7c761;
    font:inherit;
    font-size:.61rem;
    font-weight:900;
    cursor:pointer
  }
  .postSubmitRow button:disabled{
    cursor:default;
    opacity:.48
  }
  .promotionStatus{
    margin-top:14px;
    padding:11px 12px;
    border:1px solid rgba(255,205,80,.12);
    border-radius:11px;
    background:rgba(244,183,40,.045);
    color:#c9b675;
    font-size:.62rem;
    line-height:1.45;
    overflow-wrap:anywhere
  }
  .promotionStatus.paid{
    border-color:rgba(76,220,155,.16);
    background:rgba(76,220,155,.04);
    color:#9bdabf
  }
  .promotionError{
    margin:7px 1px 0!important;
    color:#d48b93!important;
    font-size:.58rem!important
  }
  .notificationXShare:focus-visible,
  .postSubmitRow input:focus-visible,
  .postSubmitRow button:focus-visible{
    outline:2px solid rgba(255,208,74,.8);
    outline-offset:2px
  }
  @media(max-width:430px){
    .postSubmitRow{
      grid-template-columns:1fr
    }
    .postSubmitRow button{
      width:100%
    }
  }
`;
