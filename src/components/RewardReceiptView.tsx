'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { NOTIFICATION_HISTORY_COPY } from '@/lib/i18n/notificationHistoryCopy';
import { REWARD_RECEIPT_COPY } from '@/lib/i18n/rewardReceiptCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';
import {
  rewardReceiptShareLabel,
  rewardReceiptXIntentUrl,
} from '@/lib/rewards/rewardReceiptShare';
import { getVeChainExplorerTransactionUrl } from '@/lib/vechainExplorer';

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

type PromotionView = {
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
  promotion?: PromotionView | null;
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

function shortTx(value: string): string {
  if (value.length < 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

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

async function loadPromotion(
  inviteCode: string,
  signal?: AbortSignal,
): Promise<PromotionView | null> {
  const response = await fetch(
    `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(inviteCode)}`,
    {
      cache: 'no-store',
      signal,
    },
  );

  const body =
    (await response.json()) as PromotionResponse;

  if (!response.ok) {
    throw new Error(
      body.error ||
        'The X promotion state could not be loaded.',
    );
  }

  return body.promotion ?? null;
}

export function RewardReceiptView({
  locale,
  receipt,
  loading,
  error,
  rewardShareUrl = '',
  onRewardShare,
}: {
  locale: SupportedLocale;
  receipt: RewardReceipt | null;
  loading: boolean;
  error: string;
  rewardShareUrl?: string;
  onRewardShare?: (intentUrl: string) => void;
}) {
  const structure = NOTIFICATION_HISTORY_COPY[locale];
  const copy = REWARD_RECEIPT_COPY[locale];
  const xCopy = promotionCopy(locale);
  const [promotion, setPromotion] =
    useState<PromotionView | null>(null);
  const [promotionLoading, setPromotionLoading] =
    useState(false);
  const [promotionError, setPromotionError] =
    useState('');
  const [postUrl, setPostUrl] = useState('');
  const [submittingPost, setSubmittingPost] =
    useState(false);
  const promotionRequestRef = useRef(0);

  const transactionUrl = receipt
    ? getVeChainExplorerTransactionUrl(
        receipt.txId,
        receipt.network === 'testnet' ? 'testnet' : 'mainnet',
      )
    : null;

  const rewardShareIntentUrl =
    receipt && rewardShareUrl
      ? rewardReceiptXIntentUrl({
          locale,
          amountB3tr: receipt.amountB3tr,
          referralUrl: rewardShareUrl,
        })
      : '';

  useEffect(() => {
    promotionRequestRef.current += 1;
    const requestId =
      promotionRequestRef.current;
    setPromotion(null);
    setPromotionError('');
    setPostUrl('');
    setSubmittingPost(false);

    if (!receipt || loading) {
      setPromotionLoading(false);
      return;
    }

    const controller = new AbortController();
    setPromotionLoading(true);

    void loadPromotion(
      receipt.inviteCode,
      controller.signal,
    )
      .then((next) => {
        if (
          promotionRequestRef.current === requestId
        ) {
          setPromotion(next);
        }
      })
      .catch((promotionLoadError) => {
        if (
          controller.signal.aborted ||
          promotionRequestRef.current !== requestId
        ) {
          return;
        }

        console.warn(
          'VeInvite X promotion state load failed:',
          promotionLoadError,
        );
        setPromotionError(xCopy.retry);
      })
      .finally(() => {
        if (
          promotionRequestRef.current === requestId
        ) {
          setPromotionLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    receipt?.id,
    receipt?.inviteCode,
    loading,
    xCopy.retry,
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

  const promotionShareIntentUrl =
    receipt && promotionShareUrl
      ? rewardReceiptXIntentUrl({
          locale,
          amountB3tr: receipt.amountB3tr,
          referralUrl: promotionShareUrl,
        })
      : '';

  const openShareIntent = (
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

  const submitPromotionPost =
    async () => {
      if (
        !receipt ||
        submittingPost ||
        !postUrl.trim()
      ) {
        return;
      }

      const inviteCode =
        receipt.inviteCode;
      const requestId =
        promotionRequestRef.current;

      setSubmittingPost(true);
      setPromotionError('');

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
              postUrl: postUrl.trim(),
            }),
          },
        );

        const body =
          (await response.json()) as
            PromotionSubmitResponse;

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
          promotionRequestRef.current !==
            requestId ||
          receipt.inviteCode !== inviteCode
        ) {
          return;
        }

        setPromotion(next);
        setPostUrl('');

        if (
          response.status === 202 ||
          body.verification?.retryable
        ) {
          setPromotionError('');
        }
      } catch (submitError) {
        console.warn(
          'VeInvite X promotion Post submission failed:',
          submitError,
        );
        setPromotionError(
          submitError instanceof Error &&
            submitError.message
            ? submitError.message
            : xCopy.retry,
        );
      } finally {
        if (
          promotionRequestRef.current ===
          requestId
        ) {
          setSubmittingPost(false);
        }
      }
    };

  const canSubmitPost =
    promotion?.state === 'OPEN' ||
    promotion?.state ===
      'SUBMISSION_GRACE';

  const showGenericShare =
    !promotion ||
    promotion.state === 'PAID' ||
    promotion.state === 'EXPIRED' ||
    promotion.state === 'RELEASED';

  const promotionStatusText =
    promotion?.state === 'OPEN'
      ? xCopy.open
      : promotion?.state ===
          'SUBMISSION_GRACE'
        ? xCopy.grace
        : promotion?.state ===
            'VERIFYING'
          ? xCopy.verifying
          : promotion?.state ===
              'RETENTION'
            ? xCopy.retention
            : promotion?.state ===
                'REVIEW_REQUIRED'
              ? xCopy.review
              : promotion?.state ===
                  'PAYOUT_PENDING'
                ? xCopy.payoutPending
                : promotion?.state ===
                    'PAID'
                  ? xCopy.paid
                  : promotion
                    ? xCopy.ended
                    : '';

  return (
    <div className="notificationReceiptView">
      {loading ? (
        <div className="notificationHistoryState" aria-busy="true">
          <span className="notificationHistorySpinner" aria-hidden="true" />
          <strong>{structure.loadingTitle}</strong>
        </div>
      ) : receipt ? (
        <>
          <section className="notificationReceiptHero">
            <div className="notificationReceiptAmount">
              <strong>{receipt.amountB3tr}</strong>
              <span>B3TR</span>
            </div>
            <p>{copy.description}</p>
          </section>
          <dl className="notificationReceiptFacts">
            <div>
              <dt>{copy.round}</dt>
              <dd>#{receipt.veBetterRoundId}</dd>
            </div>
            <div>
              <dt>{copy.invite}</dt>
              <dd>{receipt.inviteCode}</dd>
            </div>
            <div>
              <dt>{copy.transaction}</dt>
              <dd title={receipt.txId} dir="ltr">{shortTx(receipt.txId)}</dd>
            </div>
          </dl>

          {transactionUrl ? (
            <a
              className="notificationExplorerLink"
              href={transactionUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.viewTransaction}<span aria-hidden="true">↗</span>
            </a>
          ) : null}

          {promotion ? (
            <section
              className="notificationPromotionCard"
              aria-live="polite"
            >
              <div className="notificationPromotionHeading">
                <strong>{xCopy.title}</strong>
                <span>
                  +{promotion.amountB3tr} B3TR
                </span>
              </div>

              <p>{promotionStatusText}</p>

              {promotion.state === 'OPEN' &&
              promotionShareIntentUrl ? (
                <button
                  type="button"
                  className="notificationPromotionShare"
                  onClick={() =>
                    openShareIntent(
                      promotionShareIntentUrl,
                    )
                  }
                >
                  {rewardReceiptShareLabel(locale)}
                  {' · +'}
                  {promotion.amountB3tr} B3TR
                </button>
              ) : null}

              {canSubmitPost ? (
                <div className="notificationPromotionSubmit">
                  <label
                    htmlFor="veinvite-x-promotion-post-url"
                  >
                    {xCopy.inputLabel}
                  </label>
                  <input
                    id="veinvite-x-promotion-post-url"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={500}
                    value={postUrl}
                    placeholder={
                      xCopy.inputPlaceholder
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
                      submittingPost ||
                      postUrl.trim().length === 0
                    }
                    onClick={() =>
                      void submitPromotionPost()
                    }
                  >
                    {submittingPost
                      ? xCopy.verifyingButton
                      : xCopy.verify}
                  </button>
                </div>
              ) : null}

              {promotionError ? (
                <p
                  className="notificationPromotionError"
                  role="alert"
                >
                  {promotionError}
                </p>
              ) : null}
            </section>
          ) : null}

          {promotionLoading ? (
            <p
              className="notificationPromotionLoading"
              aria-live="polite"
            >
              X Promotion…
            </p>
          ) : null}

          {showGenericShare &&
          rewardShareIntentUrl ? (
            <button
              type="button"
              className="notificationXShare"
              aria-label={rewardReceiptShareLabel(locale)}
              onClick={() =>
                openShareIntent(
                  rewardShareIntentUrl,
                )
              }
            >
              {rewardReceiptShareLabel(locale)}
            </button>
          ) : null}

          {!promotion &&
          !promotionLoading &&
          promotionError ? (
            <p
              className="notificationReceiptError"
              role="alert"
            >
              {promotionError}
            </p>
          ) : null}

          {error ? (
            <p className="notificationReceiptError" role="alert">{error}</p>
          ) : null}
        </>
      ) : (
        <div className="notificationHistoryState errorState" role="alert">
          <span className="notificationHistoryStateIcon" aria-hidden="true">!</span>
          <strong>{structure.errorTitle}</strong>
          <p>{error || copy.error}</p>
        </div>
      )}

      <style jsx>{`
        .notificationReceiptView{max-height:100%;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#3b3529 transparent;padding:20px 18px 18px;box-sizing:border-box}
        .notificationReceiptHero{display:grid;gap:8px}
        .notificationReceiptAmount{display:flex;align-items:baseline;gap:7px}
        .notificationReceiptAmount strong{color:#fff1b0;font-size:1.9rem;line-height:1;font-variant-numeric:tabular-nums}
        .notificationReceiptAmount span{color:#d4b953;font-size:.64rem;font-weight:900;letter-spacing:.02em}
        .notificationReceiptHero p{margin:0;color:#a8a197;font-size:.67rem;line-height:1.55}
        .notificationReceiptFacts{margin:14px 0 0;overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:13px;background:rgba(255,255,255,.018)}
        .notificationReceiptFacts div{min-height:39px;padding:9px 11px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:14px}
        .notificationReceiptFacts div+div{border-top:1px solid rgba(255,255,255,.05)}
        .notificationReceiptFacts dt{color:#777168;font-size:.56rem;font-weight:800}
        .notificationReceiptFacts dd{margin:0;color:#d9d2c7;font-size:.6rem;font-weight:850;overflow-wrap:anywhere;text-align:end}
        .notificationExplorerLink{width:max-content;max-width:100%;margin-top:9px;display:inline-flex;align-items:center;gap:5px;color:#cdb45e;text-decoration:none;font-size:.59rem;font-weight:850}
        .notificationPromotionCard{margin-top:14px;padding:13px;border:1px solid rgba(255,205,80,.18);border-radius:14px;background:rgba(244,183,40,.045)}
        .notificationPromotionHeading{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .notificationPromotionHeading strong{color:#fff6d0;font-size:.72rem}
        .notificationPromotionHeading span{color:#ffd04a;font-size:.69rem;font-weight:950;font-variant-numeric:tabular-nums}
        .notificationPromotionCard>p{margin:7px 0 0;color:#aaa399;font-size:.62rem;line-height:1.5}
        .notificationPromotionShare{width:100%;min-height:42px;margin-top:11px;padding:9px 12px;border:1px solid rgba(255,255,255,.16);border-radius:11px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.7rem;font-weight:950;cursor:pointer}
        .notificationPromotionSubmit{display:grid;gap:7px;margin-top:10px}
        .notificationPromotionSubmit label{color:#8e887e;font-size:.56rem;font-weight:850}
        .notificationPromotionSubmit input{width:100%;min-height:40px;box-sizing:border-box;padding:9px 10px;border:1px solid rgba(255,255,255,.11);border-radius:10px;background:#0d0e0c;color:#e9e5de;font:inherit;font-size:.66rem;direction:ltr;text-align:left;outline:none}
        .notificationPromotionSubmit input:focus{border-color:rgba(255,205,80,.5);box-shadow:0 0 0 2px rgba(255,205,80,.08)}
        .notificationPromotionSubmit button{width:100%;min-height:40px;border:1px solid rgba(255,205,80,.2);border-radius:10px;background:rgba(244,183,40,.09);color:#f1cf65;font:inherit;font-size:.66rem;font-weight:900;cursor:pointer}
        .notificationPromotionSubmit button:disabled{opacity:.5;cursor:not-allowed}
        .notificationPromotionError{color:#d48b93!important}
        .notificationPromotionLoading{margin:12px 0 0;color:#777168;font-size:.59rem}
        .notificationXShare{width:100%;min-height:44px;margin-top:14px;padding:10px 14px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.75rem;font-weight:950;cursor:pointer}
        .notificationReceiptError{margin:8px 0 0!important;color:#d48b93!important;font-size:.6rem!important}
        .notificationHistoryState{height:100%;min-height:0;box-sizing:border-box;padding:36px 24px;display:grid;place-items:center;align-content:center;text-align:center}
        .notificationHistorySpinner{width:32px;height:32px;border:3px solid rgba(244,183,40,.16);border-top-color:#e6bd4c;border-radius:50%;animation:notificationHistorySpin .8s linear infinite}
        .notificationHistoryStateIcon{width:54px;height:54px;display:grid;place-items:center;border-radius:18px;background:rgba(255,110,120,.08);color:#ff8f9b;font-size:1.2rem;font-weight:950}
        .notificationHistoryState strong{margin-top:14px;color:#ddd8cf;font-size:.9rem}
        .notificationHistoryState p{max-width:280px;margin:7px 0 0;color:#77726b;font-size:.66rem;line-height:1.55}
        .notificationXShare:focus-visible,.notificationExplorerLink:focus-visible,.notificationPromotionShare:focus-visible,.notificationPromotionSubmit button:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        @keyframes notificationHistorySpin{to{transform:rotate(360deg)}}
        @media(max-width:560px){.notificationReceiptView{padding:16px 14px}.notificationReceiptAmount strong{font-size:1.75rem}}
        @media(prefers-reduced-motion:reduce){.notificationHistorySpinner{animation:none}}
      `}</style>
    </div>
  );
}
