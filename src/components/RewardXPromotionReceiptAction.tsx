'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { SupportedLocale } from '@/lib/i18n/locales';
import {
  buildRewardXPromotionIntentUrl,
  loadRewardXPromotion,
  submitRewardXPromotionPost,
  type RewardXPromotion,
} from '@/lib/rewards/rewardXPromotionClient';

function copyFor(locale: SupportedLocale) {
  if (locale === 'ko') {
    return {
      loading: 'X 공유 혜택 확인 중…',
      share: 'X에 공유',
      promo: (amount: string) =>
        `X에 공유하고 +${amount} B3TR`,
      postHelp:
        'X에 게시한 뒤 게시물 링크를 아래에 붙여넣어 확인하세요.',
      postPlaceholder: 'https://x.com/.../status/...',
      verify: '게시물 링크 확인',
      verifying: '게시물 확인 중…',
      retrying:
        'X 확인이 지연되고 있어요. 자동으로 다시 확인합니다.',
      retention:
        'X 공유가 확인됐어요. 24시간 후에도 같은 게시물이 공개 상태면 보상이 지급됩니다.',
      payout: 'X 공유 조건 확인 완료 · 지급 준비 중',
      paid: (amount: string) =>
        `X Promotion Bonus +${amount} B3TR 지급 완료`,
      grace:
        '공유 기한은 끝났지만 이미 게시한 글은 잠시 확인할 수 있어요.',
      submitError: '게시물 링크를 확인하지 못했어요.',
    };
  }

  return {
    loading: 'Checking X sharing benefit…',
    share: 'Share on X',
    promo: (amount: string) =>
      `Share on X and earn +${amount} B3TR`,
    postHelp:
      'After posting on X, paste the public Post URL below to verify it.',
    postPlaceholder: 'https://x.com/.../status/...',
    verify: 'Verify Post URL',
    verifying: 'Checking your Post…',
    retrying:
      'X verification is delayed. VeInvite will retry automatically.',
    retention:
      'Your X share is verified. If the same Post is still public after 24 hours, the bonus will be paid.',
    payout: 'X share verified · preparing bonus payout',
    paid: (amount: string) =>
      `X Promotion Bonus +${amount} B3TR paid`,
    grace:
      'The sharing window ended, but an already-published Post can still be submitted briefly.',
    submitError: 'The Post URL could not be verified.',
  };
}

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
  const copy = copyFor(locale);
  const requestIdRef = useRef(0);
  const [promotion, setPromotion] =
    useState<RewardXPromotion | null | undefined>(undefined);
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
      setPromotion(next);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      console.warn(
        'VeInvite X promotion state load failed:',
        error,
      );
      setLoadFailed(true);
      setPromotion(null);
    }
  }, [inviteCode]);

  useEffect(() => {
    setPromotion(undefined);
    setPostUrl('');
    setSubmitError('');
    void refresh();

    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

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
          : copy.submitError,
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    copy.submitError,
    inviteCode,
    postUrl,
    refresh,
    submitting,
  ]);

  if (promotion === undefined) {
    return (
      <button
        type="button"
        className="notificationXShare promotionLoading"
        disabled
        aria-busy="true"
      >
        {copy.loading}
        <style jsx>{styles}</style>
      </button>
    );
  }

  const ordinaryShare = () => (
    ordinaryShareIntentUrl ? (
      <button
        type="button"
        className="notificationXShare"
        onClick={() => openIntent(ordinaryShareIntentUrl)}
      >
        {copy.share}
        <style jsx>{styles}</style>
      </button>
    ) : null
  );

  if (!promotion) {
    return ordinaryShare();
  }

  if (
    promotion.state === 'EXPIRED' ||
    promotion.state === 'RELEASED'
  ) {
    return ordinaryShare();
  }

  if (promotion.state === 'PAID') {
    return (
      <div className="promotionStatus paid" role="status">
        <strong>{copy.paid(promotion.amountB3tr)}</strong>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (promotion.state === 'RETENTION') {
    return (
      <div className="promotionStatus" role="status">
        <strong>{copy.retention}</strong>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (promotion.state === 'PAYOUT_PENDING') {
    return (
      <div className="promotionStatus" role="status">
        <strong>{copy.payout}</strong>
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
            ? copy.verifying
            : copy.retrying}
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
          {copy.promo(promotion.amountB3tr)}
        </button>
      ) : null}

      <p>
        {promotion.state === 'SUBMISSION_GRACE'
          ? copy.grace
          : copy.postHelp}
      </p>

      <div className="postSubmitRow">
        <input
          type="url"
          value={postUrl}
          placeholder={copy.postPlaceholder}
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
          {submitting ? copy.verifying : copy.verify}
        </button>
      </div>

      {submitError ? (
        <p className="promotionError" role="alert">
          {submitError}
        </p>
      ) : null}

      {loadFailed ? (
        <p className="promotionError" role="status">
          {copy.submitError}
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
    line-height:1.45
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
    line-height:1.45
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
