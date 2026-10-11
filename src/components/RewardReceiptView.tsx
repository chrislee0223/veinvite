'use client';

import {
  useCallback,
  useEffect,
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
import {
  parseRewardXPromotionResponse,
  rewardXPromotionCopy,
  type RewardXPromotion,
  type RewardXPromotionSubmitResponse,
} from '@/lib/rewards/rewardXPromotionClient';
import { getVeChainExplorerTransactionUrl } from '@/lib/vechainExplorer';

const PROMOTION_POLL_MS = 30_000;
const POLLED_PROMOTION_STATES =
  new Set<RewardXPromotion['state']>([
    'VERIFYING',
    'RETENTION',
    'REVIEW_REQUIRED',
    'PAYOUT_PENDING',
  ]);

function shortTx(value: string): string {
  if (value.length < 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
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
  const copy =
    REWARD_RECEIPT_COPY[locale] ??
    REWARD_RECEIPT_COPY.en;
  const promotionCopy =
    rewardXPromotionCopy(locale);
  const promotionRequestRef = useRef(0);
  const [promotion, setPromotion] =
    useState<RewardXPromotion | null>(null);
  const [promotionResolved, setPromotionResolved] =
    useState(false);
  const [
    promotionStatusUnavailable,
    setPromotionStatusUnavailable,
  ] = useState(false);
  const [promotionLoading, setPromotionLoading] =
    useState(false);
  const [postUrl, setPostUrl] = useState('');
  const [postSubmitting, setPostSubmitting] =
    useState(false);
  const [postError, setPostError] = useState('');

  const receiptInviteCode =
    receipt?.inviteCode ?? '';

  const loadPromotion =
    useCallback(async ({
      visibleLoading = false,
    }: {
      visibleLoading?: boolean;
    } = {}) => {
      if (!receiptInviteCode) {
        setPromotion(null);
        setPromotionResolved(true);
        setPromotionStatusUnavailable(false);
        setPromotionLoading(false);
        return;
      }

      const requestId =
        promotionRequestRef.current + 1;
      promotionRequestRef.current = requestId;

      if (visibleLoading) {
        setPromotionLoading(true);
      }

      try {
        const response = await fetch(
          `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(
            receiptInviteCode,
          )}`,
          {
            cache: 'no-store',
          },
        );
        const raw = await response.json() as unknown;
        const parsed =
          parseRewardXPromotionResponse(raw);

        if (!response.ok || !parsed) {
          throw new Error(
            'X promotion state is unavailable.',
          );
        }

        if (
          promotionRequestRef.current !==
          requestId
        ) {
          return;
        }

        setPromotion(parsed.promotion);
        setPromotionResolved(true);
        setPromotionStatusUnavailable(false);
      } catch (promotionError) {
        if (
          promotionRequestRef.current !==
          requestId
        ) {
          return;
        }

        console.warn(
          'VeInvite X promotion receipt state unavailable:',
          promotionError,
        );
        // Promotion lookup is optional UI enrichment. Never replace or hide
        // the authoritative base reward receipt because this read failed.
        setPromotion(null);
        setPromotionResolved(true);
        setPromotionStatusUnavailable(true);
      } finally {
        if (
          promotionRequestRef.current ===
          requestId
        ) {
          setPromotionLoading(false);
        }
      }
    }, [receiptInviteCode]);

  useEffect(() => {
    promotionRequestRef.current += 1;
    setPromotion(null);
    setPromotionResolved(false);
    setPromotionStatusUnavailable(false);
    setPromotionLoading(Boolean(receiptInviteCode));
    setPostUrl('');
    setPostSubmitting(false);
    setPostError('');

    if (!receiptInviteCode) {
      setPromotionResolved(true);
      setPromotionLoading(false);
      return;
    }

    void loadPromotion({
      visibleLoading: true,
    });

    return () => {
      promotionRequestRef.current += 1;
    };
  }, [loadPromotion, receiptInviteCode]);

  useEffect(() => {
    if (
      !promotion ||
      !POLLED_PROMOTION_STATES.has(
        promotion.state,
      )
    ) {
      return;
    }

    const timer = window.setInterval(
      () => {
        void loadPromotion();
      },
      PROMOTION_POLL_MS,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [loadPromotion, promotion]);

  const transactionUrl = receipt
    ? getVeChainExplorerTransactionUrl(
        receipt.txId,
        receipt.network === 'testnet'
          ? 'testnet'
          : 'mainnet',
      )
    : null;

  const genericShareIntentUrl =
    receipt && rewardShareUrl
      ? rewardReceiptXIntentUrl({
          locale,
          amountB3tr: receipt.amountB3tr,
          referralUrl: rewardShareUrl,
        })
      : '';

  const promotionShareIntentUrl =
    receipt &&
    promotion?.state === 'OPEN' &&
    promotion.shareUrl
      ? rewardReceiptXIntentUrl({
          locale,
          amountB3tr: receipt.amountB3tr,
          referralUrl: promotion.shareUrl,
        })
      : '';

  const shareRewardOnX = () => {
    if (!genericShareIntentUrl) return;
    if (onRewardShare) {
      onRewardShare(genericShareIntentUrl);
      return;
    }
    window.open(
      genericShareIntentUrl,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const sharePromotionOnX = () => {
    if (!promotionShareIntentUrl) return;

    // Opening X is never proof of posting and must never acknowledge the
    // reward receipt or mutate promotion state. Verification starts only
    // after the user submits the public X Post URL below.
    window.open(
      promotionShareIntentUrl,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const submitPromotionPost =
    useCallback(async () => {
      if (
        !receipt ||
        !promotion ||
        !['OPEN', 'SUBMISSION_GRACE'].includes(
          promotion.state,
        ) ||
        postSubmitting
      ) {
        return;
      }

      const normalizedPostUrl =
        postUrl.trim();

      if (!normalizedPostUrl) {
        return;
      }

      setPostSubmitting(true);
      setPostError('');

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
              inviteCode:
                receipt.inviteCode,
              postUrl:
                normalizedPostUrl,
            }),
          },
        );

        const body =
          await response.json() as
            RewardXPromotionSubmitResponse;

        if (!response.ok) {
          console.warn(
            'VeInvite X promotion Post submission rejected:',
            body.error ??
              body.verification?.reason ??
              response.status,
          );
          setPostError(
            promotionCopy.submitFailed,
          );
          // The server may have advanced the durable opportunity to a
          // terminal state even when this particular submission failed.
          void loadPromotion();
          return;
        }

        setPostUrl('');
        await loadPromotion({
          visibleLoading: true,
        });
      } catch (submitError) {
        console.warn(
          'VeInvite X promotion Post submission unavailable:',
          submitError,
        );
        setPostError(
          promotionCopy.submitFailed,
        );
      } finally {
        setPostSubmitting(false);
      }
    }, [
      loadPromotion,
      postSubmitting,
      postUrl,
      promotion,
      promotionCopy.submitFailed,
      receipt,
    ]);

  const promotionBody =
    promotion
      ? (() => {
          switch (promotion.state) {
            case 'OPEN':
              return promotionCopy.openBody;
            case 'SUBMISSION_GRACE':
              return promotionCopy.graceBody;
            case 'VERIFYING':
              return promotionCopy.verifyingBody;
            case 'RETENTION':
              return promotionCopy.retentionBody;
            case 'REVIEW_REQUIRED':
              return promotionCopy.reviewBody;
            case 'PAYOUT_PENDING':
              return promotionCopy.payoutPendingBody;
            case 'PAID':
              return promotionCopy.paidBody(
                promotion.amountB3tr,
              );
            case 'EXPIRED':
              return promotionCopy.expiredBody;
            case 'RELEASED':
              return promotionCopy.releasedBody;
          }
        })()
      : '';

  const canSubmitPromotionPost =
    Boolean(
      promotion &&
      ['OPEN', 'SUBMISSION_GRACE'].includes(
        promotion.state,
      ),
    );

  const showGenericShare =
    promotionResolved &&
    !promotionStatusUnavailable &&
    promotion === null &&
    genericShareIntentUrl;

  return (
    <div className="notificationReceiptView">
      {loading ? (
        <div
          className="notificationHistoryState"
          aria-busy="true"
        >
          <span
            className="notificationHistorySpinner"
            aria-hidden="true"
          />
          <strong>
            {structure.loadingTitle}
          </strong>
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
              <dd
                title={receipt.txId}
                dir="ltr"
              >
                {shortTx(receipt.txId)}
              </dd>
            </div>
          </dl>

          {transactionUrl ? (
            <a
              className="notificationExplorerLink"
              href={transactionUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.viewTransaction}
              <span aria-hidden="true">↗</span>
            </a>
          ) : null}

          {promotionLoading &&
          !promotionResolved ? (
            <section
              className="promotionPanel"
              aria-busy="true"
            >
              <strong>
                {promotionCopy.title}
              </strong>
              <p>{structure.loadingTitle}</p>
            </section>
          ) : null}

          {promotionStatusUnavailable ? (
            <section
              className="promotionPanel"
              role="status"
            >
              <strong>
                {promotionCopy.title}
              </strong>
              <p>
                {promotionCopy.unavailableBody}
              </p>
              <button
                type="button"
                className="promotionSecondaryButton"
                disabled={promotionLoading}
                onClick={() => {
                  void loadPromotion({
                    visibleLoading: true,
                  });
                }}
              >
                {promotionCopy.retry}
              </button>
            </section>
          ) : null}

          {promotion ? (
            <section
              className="promotionPanel"
              data-state={promotion.state}
            >
              <div className="promotionHeading">
                <strong>
                  {promotionCopy.title}
                </strong>
                <span>
                  +{promotion.amountB3tr} B3TR
                </span>
              </div>
              <p>{promotionBody}</p>

              {promotion.state === 'OPEN' &&
              promotionShareIntentUrl ? (
                <button
                  type="button"
                  className="notificationXShare"
                  onClick={sharePromotionOnX}
                >
                  {promotionCopy.shareCta(
                    promotion.amountB3tr,
                  )}
                </button>
              ) : null}

              {canSubmitPromotionPost ? (
                <div className="promotionSubmit">
                  <input
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={postUrl}
                    placeholder={
                      promotionCopy.postUrlPlaceholder
                    }
                    disabled={postSubmitting}
                    onChange={(event) => {
                      setPostUrl(
                        event.target.value,
                      );
                      setPostError('');
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        postUrl.trim() &&
                        !postSubmitting
                      ) {
                        event.preventDefault();
                        void submitPromotionPost();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="promotionSubmitButton"
                    disabled={
                      postSubmitting ||
                      !postUrl.trim()
                    }
                    onClick={() => {
                      void submitPromotionPost();
                    }}
                  >
                    {postSubmitting
                      ? promotionCopy.submittingPost
                      : promotionCopy.submitPost}
                  </button>
                </div>
              ) : null}

              {postError ? (
                <p
                  className="promotionError"
                  role="alert"
                >
                  {postError}
                </p>
              ) : null}
            </section>
          ) : null}

          {showGenericShare ? (
            <button
              type="button"
              className="notificationXShare"
              aria-label={
                rewardReceiptShareLabel(locale)
              }
              onClick={shareRewardOnX}
            >
              {rewardReceiptShareLabel(locale)}
            </button>
          ) : null}

          {error ? (
            <p
              className="notificationReceiptError"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <div
          className="notificationHistoryState errorState"
          role="alert"
        >
          <span
            className="notificationHistoryStateIcon"
            aria-hidden="true"
          >
            !
          </span>
          <strong>
            {structure.errorTitle}
          </strong>
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
        .notificationXShare{width:100%;min-height:44px;margin-top:14px;padding:10px 14px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.75rem;font-weight:950;cursor:pointer}
        .promotionPanel{margin-top:14px;padding:12px;border:1px solid rgba(255,205,80,.16);border-radius:14px;background:rgba(244,183,40,.035)}
        .promotionHeading{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .promotionHeading strong,.promotionPanel>strong{color:#f7ebbd;font-size:.7rem;font-weight:950}
        .promotionHeading span{color:#ffd04a;font-size:.7rem;font-weight:950;font-variant-numeric:tabular-nums;white-space:nowrap}
        .promotionPanel p{margin:7px 0 0;color:#a8a197;font-size:.64rem;line-height:1.5;overflow-wrap:anywhere}
        .promotionSubmit{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:9px}
        .promotionSubmit input{min-width:0;height:40px;box-sizing:border-box;padding:0 10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.035);color:#eee9df;font:inherit;font-size:.64rem;outline:none}
        .promotionSubmit input:focus{border-color:rgba(255,205,80,.5);box-shadow:0 0 0 2px rgba(255,205,80,.08)}
        .promotionSubmitButton,.promotionSecondaryButton{min-height:40px;padding:8px 11px;border:1px solid rgba(255,205,80,.2);border-radius:10px;background:rgba(244,183,40,.09);color:#f2d36c;font:inherit;font-size:.64rem;font-weight:900;cursor:pointer}
        .promotionSubmitButton:disabled,.promotionSecondaryButton:disabled{opacity:.5;cursor:default}
        .promotionSecondaryButton{width:100%;margin-top:9px}
        .promotionError{color:#d48b93!important}
        .notificationReceiptError{margin:8px 0 0!important;color:#d48b93!important;font-size:.6rem!important}
        .notificationHistoryState{height:100%;min-height:0;box-sizing:border-box;padding:36px 24px;display:grid;place-items:center;align-content:center;text-align:center}
        .notificationHistorySpinner{width:32px;height:32px;border:3px solid rgba(244,183,40,.16);border-top-color:#e6bd4c;border-radius:50%;animation:notificationHistorySpin .8s linear infinite}
        .notificationHistoryStateIcon{width:54px;height:54px;display:grid;place-items:center;border-radius:18px;background:rgba(255,110,120,.08);color:#ff8f9b;font-size:1.2rem;font-weight:950}
        .notificationHistoryState strong{margin-top:14px;color:#ddd8cf;font-size:.9rem}
        .notificationHistoryState p{max-width:280px;margin:7px 0 0;color:#77726b;font-size:.66rem;line-height:1.55}
        .notificationXShare:focus-visible,.notificationExplorerLink:focus-visible,.promotionSubmitButton:focus-visible,.promotionSecondaryButton:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        @keyframes notificationHistorySpin{to{transform:rotate(360deg)}}
        @media(max-width:560px){.notificationReceiptView{padding:16px 14px}.notificationReceiptAmount strong{font-size:1.75rem}.promotionSubmit{grid-template-columns:1fr}.promotionSubmitButton{width:100%}}
        @media(prefers-reduced-motion:reduce){.notificationHistorySpinner{animation:none}}
      `}</style>
    </div>
  );
}
