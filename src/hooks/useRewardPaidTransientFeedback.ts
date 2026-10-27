'use client';

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  TransientFeedback,
} from '@/components/TransientSnackbar';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import { REWARD_RECEIPT_COPY } from '@/lib/i18n/rewardReceiptCopy';
import { REWARD_X_PROMOTION_COPY } from '@/lib/i18n/rewardXPromotionCopy';
import { REWARD_X_PROMOTION_AUTO_COPY } from '@/lib/i18n/rewardXPromotionAutoCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';
import {
  clearRewardPaidToast,
  readRewardPaidToast,
  REWARD_PAID_TOAST_UPDATED_EVENT,
  type RewardPaidToastPayload,
} from '@/lib/notifications/rewardPaidToast';
import type { ReferralLinkRecord } from '@/lib/referralLinks';
import {
  rewardReceiptShareLabel,
  rewardReceiptXIntentUrl,
  rewardXPromotionShareUrl,
} from '@/lib/rewards/rewardReceiptShare';
import {
  notifyRewardClaimSessionInvalid,
} from '@/lib/rewards/rewardClaimClient';
import { buildProductionSharePageUrl } from '@/lib/socialShareCard';
import { EARLY_REWARD_TRANSFER_COPY } from '@/lib/i18n/earlyRewardTransferCopy';
import { formatWeiAsB3tr } from '@/lib/reporting/roundReport';
import {
  markEarlyRewardTransferShown,
  wasEarlyRewardTransferShown,
} from '@/lib/rewards/earlyRewardTransferFeedback';
import { REWARD_CLAIM_UPDATED_EVENT } from '@/lib/rewards/rewardClaimClient';
import type { RewardActionResponse } from '@/lib/notifications/rewardAction';

const CANONICAL_TX_PATTERN = /^0x[0-9a-f]{64}$/iu;
const POSITIVE_WEI_PATTERN = /^[0-9]+$/u;
const CANONICAL_FAST_POLL_MS = 5_000;
const CANONICAL_IDLE_POLL_MS = 60_000;

const REWARD_RECEIPT_ACKNOWLEDGED_EVENT =
  'veinvite-reward-receipt-acknowledged';

type RewardXPromotionPopupState = {
  newOffersEnabled?: boolean;
  promotionPending?: boolean;
  xUrlLessEnabled?: boolean;
  xConnected?: boolean;
  promotion?: {
    state?: string;
    amountB3tr?: string;
    shareToken?: string | null;
    postDeadlineAt?: string;
  } | null;
  error?: string;
};

export function useRewardPaidTransientFeedback({
  wallet,
  locale,
  referralLink,
  referralLinkVerified,
  referralLinkFailed,
  feedback,
  setFeedback,
}: {
  wallet: string | null;
  locale: SupportedLocale;
  referralLink: ReferralLinkRecord | null;
  referralLinkVerified: boolean;
  referralLinkFailed: boolean;
  feedback: TransientFeedback | null;
  setFeedback: Dispatch<SetStateAction<TransientFeedback | null>>;
}) {
  const [pendingReward, setPendingReward] =
    useState<RewardPaidToastPayload | null>(null);
  const [earlyTransfer, setEarlyTransfer] = useState<{
    inviteCode: string;
    feedbackId: number;
  } | null>(null);
  const feedbackIdRef = useRef(0);
  const shareExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (shareExpiryTimerRef.current !== null) {
      clearTimeout(shareExpiryTimerRef.current);
    }
  }, []);

  useEffect(() => {
    setFeedback((current) =>
      current?.kind === 'reward' ? null : current,
    );
    setPendingReward(
      wallet ? readRewardPaidToast(wallet) : null,
    );
  }, [setFeedback, wallet]);

  // The server-authenticated receipt poller restores first-unseen rewards
  // after a fresh app launch. Pick up its queue updates even when the Home
  // component was mounted before the post-startup receipt check completed.
  useEffect(() => {
    if (!wallet) return;
    const onQueueUpdated = () => {
      setPendingReward(readRewardPaidToast(wallet));
    };
    window.addEventListener(REWARD_PAID_TOAST_UPDATED_EVENT, onQueueUpdated);
    // Close the subscribe/read race if a receipt arrived just before mount.
    onQueueUpdated();
    return () => {
      window.removeEventListener(REWARD_PAID_TOAST_UPDATED_EVENT, onQueueUpdated);
    };
  }, [wallet]);

  const acknowledgeReward = useCallback(async (
    payload: RewardPaidToastPayload,
  ) => {
    try {
      const response = await fetch(
        `/api/rewards/receipts/${encodeURIComponent(payload.receiptId)}/seen`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent: 'ACKNOWLEDGE_REWARD_RECEIPT',
          }),
        },
      );

      if (!response.ok) return;

      window.dispatchEvent(
        new Event(REWARD_RECEIPT_ACKNOWLEDGED_EVENT),
      );
    } catch {
      // Receipt read state is UI-only; payout truth remains server-authoritative.
    }
  }, []);

  useEffect(() => {
    if (!pendingReward || feedback) return;

    // This same wallet + immutable tx already received a canonical transfer
    // notice. Preserve the finalized receipt (and its unread history) but do
    // not interrupt the user with a second, identical reward popup 80m later.
    if (wasEarlyRewardTransferShown(
      pendingReward.recipientWallet,
      pendingReward.inviteCode,
      pendingReward.txId ?? '',
    )) {
      if (wallet) {
        clearRewardPaidToast(wallet, pendingReward.receiptId);
        setPendingReward(readRewardPaidToast(wallet));
      }
      return;
    }

    const shareReady =
      referralLinkVerified && referralLink !== null;
    const shareUnavailable =
      referralLinkFailed && !shareReady;

    // The core payout confirmation must never wait for optional sharing state.
    // Wait only until permanent-link verification itself has resolved, then
    // render the paid feedback immediately and enrich the X action afterward.
    if (!shareReady && !shareUnavailable) return;

    const payload = pendingReward;
    if (shareExpiryTimerRef.current !== null) {
      clearTimeout(shareExpiryTimerRef.current);
      shareExpiryTimerRef.current = null;
    }
    feedbackIdRef.current += 1;
    const feedbackId = feedbackIdRef.current;

    setFeedback({
      id: feedbackId,
      kind: 'reward',
      title:
        NOTIFICATION_COPY[locale].rewardTitle,
      text:
        REWARD_RECEIPT_COPY[locale].description,
      amountB3tr:
        payload.amountB3tr,
      confirmLabel:
        NOTIFICATION_COPY[locale].confirm,
      onConfirm: () => {
        if (wallet) {
          clearRewardPaidToast(
            wallet,
            payload.receiptId,
          );
          setPendingReward(
            readRewardPaidToast(wallet),
          );
        }
        return acknowledgeReward(payload);
      },
    });
    setPendingReward(null);

    if (!shareReady || !referralLink) {
      return;
    }

    const referralUrl =
      buildProductionSharePageUrl(
        's',
        referralLink.key,
      );

    const enrichShareAction = async () => {
      let shareIntentUrl = '';
      let shareLabel = '';
      let shareDeadlineMs: number | null = null;
      let autoShareFollowup = false;

      try {
        const response = await fetch(
          `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(payload.inviteCode)}`,
          {
            cache: 'no-store',
            signal:
              AbortSignal.timeout(4_000),
          },
        );
        const body =
          (await response.json()) as RewardXPromotionPopupState;

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          notifyRewardClaimSessionInvalid();
        }

        if (!response.ok) return;

        const promotion =
          body.promotion ?? null;

        if (
          promotion?.state === 'OPEN' &&
          typeof promotion.shareToken === 'string' &&
          typeof promotion.amountB3tr === 'string' &&
          typeof promotion.postDeadlineAt === 'string' &&
          Number.isFinite(Date.parse(promotion.postDeadlineAt)) &&
          Date.now() < Date.parse(promotion.postDeadlineAt)
        ) {
          const usesAuto = body.xUrlLessEnabled === true;
          // Author-targeted auto discovery needs an authenticated account.
          // A generic share before OAuth cannot qualify for the +10 bonus.
          // The reward receipt panel owns the one-time X connection action.
          if (!usesAuto || body.xConnected === true) {
            shareDeadlineMs = Date.parse(promotion.postDeadlineAt);
            autoShareFollowup = usesAuto;
            const promotionUrl =
              rewardXPromotionShareUrl({
                referralUrl,
                shareToken:
                  promotion.shareToken,
              });

            if (promotionUrl) {
              shareIntentUrl =
                rewardReceiptXIntentUrl({
                  locale,
                  amountB3tr:
                    payload.amountB3tr,
                  referralUrl:
                    promotionUrl,
                });
              shareLabel =
                `${rewardReceiptShareLabel(locale)} · +${promotion.amountB3tr} B3TR`;
            }
          }
        } else if (
          promotion === null &&
          body.promotionPending !== true
        ) {
          // Legacy/general sharing is safe only when this specific reward
          // has no active or pending promotion obligation.
          shareIntentUrl =
            rewardReceiptXIntentUrl({
              locale,
              amountB3tr:
                payload.amountB3tr,
              referralUrl,
            });
          shareLabel =
            rewardReceiptShareLabel(locale);
        }
      } catch {
        // Fail closed for optional sharing. The already-visible payout
        // confirmation remains usable even when promotion lookup is slow.
        return;
      }

      if (!shareIntentUrl) return;

      // Do not offer an expired promotion from a delayed API response.
      if (shareDeadlineMs !== null && Date.now() >= shareDeadlineMs) return;

      setFeedback((current) => {
        if (
          current?.kind !== 'reward' ||
          current.id !== feedbackId
        ) {
          return current;
        }

        return {
          ...current,
          shareLabel,
          onShare: () => {
            // Even if a browser suspends timers in the background, an old
            // reward popup cannot launch an expired qualifying share link.
            if (shareDeadlineMs !== null && Date.now() >= shareDeadlineMs) {
              setFeedback((visible) =>
                visible?.kind === 'reward' && visible.id === feedbackId
                  ? { ...visible, shareLabel: undefined, onShare: undefined }
                  : visible,
              );
              return;
            }
            window.open(
              shareIntentUrl,
              '_blank',
              'noopener,noreferrer',
            );
            if (shareDeadlineMs !== null) {
              // Opening an X composer does not prove publication.
              // Legacy offers still require a Post URL; for newly enabled
              // author-scanned offers we only remind users to keep the Post
              // public, without requesting any additional user action.
              setFeedback((visible) =>
                visible?.kind === 'reward' && visible.id === feedbackId
                  ? {
                      ...visible,
                      text: autoShareFollowup
                        ? REWARD_X_PROMOTION_AUTO_COPY[locale].autoShareFollowupBody
                        : REWARD_X_PROMOTION_COPY[locale].shareFollowupBody,
                    }
                  : visible,
              );
            }
          },
        };
      });

      // Remove a promotional button at its expiry boundary without polling
      // the DB for the whole 24-hour window.
      if (shareDeadlineMs !== null) {
        const delay = Math.max(0, shareDeadlineMs - Date.now() + 250);
        shareExpiryTimerRef.current = setTimeout(() => {
          setFeedback((visible) =>
            visible?.kind === 'reward' && visible.id === feedbackId
              ? { ...visible, shareLabel: undefined, onShare: undefined }
              : visible,
          );
          shareExpiryTimerRef.current = null;
        }, delay);
      }
    };

    void enrichShareAction();
  }, [
    acknowledgeReward,
    feedback,
    locale,
    pendingReward,
    referralLink,
    referralLinkFailed,
    referralLinkVerified,
    setFeedback,
    wallet,
  ]);

  // Early UI feedback is driven exclusively by the authenticated reward-action
  // reader and its manifest-verified canonical broadcast marker. Never infer a
  // successful transfer from a Claim response, a tx hash alone or a timer.
  // The PAID receipt, Sybil gates, X opportunity and any payouts stay unchanged.
  useEffect(() => {
    if (!wallet) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const poll = async () => {
      if (disposed || inFlight) return;
      if (document.visibilityState !== 'visible') {
        schedule(CANONICAL_IDLE_POLL_MS);
        return;
      }

      inFlight = true;
      let processing = false;
      try {
        const response = await fetch('/api/notifications/reward-actions', {
          cache: 'no-store',
          credentials: 'include',
          signal: AbortSignal.timeout(8_000),
        });
        if (response.status === 401 || response.status === 403) {
          notifyRewardClaimSessionInvalid();
          return;
        }
        if (!response.ok) return;
        const body = (await response.json()) as RewardActionResponse;
        // A stale response after wallet switching must never celebrate
        // somebody else's transfer.
        if (disposed || body.walletAddress?.toLowerCase() !== wallet.toLowerCase()) return;

        for (const action of body.actions ?? []) {
          if (action.status === 'AWAITING_CLAIM') continue;
          processing = true;
          const amountWei = action.claimAmountWei ?? action.reservedAmountWei;
          if (
            !action.broadcastConfirmedAt ||
            !action.txId ||
            !CANONICAL_TX_PATTERN.test(action.txId) ||
            !amountWei ||
            !POSITIVE_WEI_PATTERN.test(amountWei) ||
            BigInt(amountWei) <= 0n ||
            wasEarlyRewardTransferShown(wallet, action.inviteCode, action.txId)
          ) continue;
          // Do not hide a different reward notice or another user's dialog.
          if (feedback !== null) continue;
          const tx = action.txId;
          const code = action.inviteCode;
          markEarlyRewardTransferShown(wallet, code, tx);
          const earlyFeedbackId = Date.now();
          setEarlyTransfer({ inviteCode: code, feedbackId: earlyFeedbackId });
          setFeedback({
            id: earlyFeedbackId,
            kind: 'reward',
            title: EARLY_REWARD_TRANSFER_COPY[locale].title,
            text: EARLY_REWARD_TRANSFER_COPY[locale].body,
            amountB3tr: formatWeiAsB3tr(amountWei, 18),
            confirmLabel: NOTIFICATION_COPY[locale].confirm,
            // Dismisses UI only. Never acknowledges or creates a PAID receipt.
            onConfirm: () => {},
          });
          break;
        }
      } catch {
        // An optional UI poll must never alter payment or receipt state.
      } finally {
        inFlight = false;
        if (!disposed) schedule(processing ? CANONICAL_FAST_POLL_MS : CANONICAL_IDLE_POLL_MS);
      }
    };

    const schedule = (delay: number) => {
      if (disposed) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void poll();
      }, delay);
    };

    const onClaim = () => schedule(200);
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule(200);
    };

    window.addEventListener(REWARD_CLAIM_UPDATED_EVENT, onClaim);
    document.addEventListener('visibilitychange', onVisible);
    schedule(400);
    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener(REWARD_CLAIM_UPDATED_EVENT, onClaim);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [wallet, locale, feedback, setFeedback]);


  // Optional early X action. The URL carries a DB-issued share token only
  // after an immutable, security-checked opportunity is actually OPEN.
  // Never imply that a generic composer post qualifies for +10 B3TR.
  useEffect(() => {
    if (
      !wallet ||
      !earlyTransfer ||
      feedback?.kind !== 'reward' ||
      feedback.id !== earlyTransfer.feedbackId ||
      !referralLinkVerified ||
      !referralLink
    ) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let shareExpiryTimer: ReturnType<typeof setTimeout> | null = null;
    let shareReady = false;
    const startedAt = Date.now();
    const referralUrl = buildProductionSharePageUrl('s', referralLink.key);

    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(earlyTransfer.inviteCode)}`,
          { cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(7_000) },
        );
        if (response.status === 401 || response.status === 403) {
          notifyRewardClaimSessionInvalid();
          return;
        }
        if (!response.ok) return;
        const body = (await response.json()) as RewardXPromotionPopupState & {
          xConnectAvailable?: boolean;
        };
        const offer = body.promotion;
        if (!offer || offer.state !== 'OPEN' || !offer.shareToken ||
            !offer.postDeadlineAt || !offer.amountB3tr ||
            Date.now() >= Date.parse(offer.postDeadlineAt)) return;
        if (cancelled) return;

        // URL-less auto-discovery requires a linked X author before we offer
        // an incentive-qualified composer. Never show a misleading +10 link.
        if (body.xUrlLessEnabled && body.xConnected !== true) {
          if (body.xConnectAvailable) {
            shareReady = true;
            setFeedback(current =>
              current?.kind === 'reward' && current.id === earlyTransfer.feedbackId
                ? {
                    ...current,
                    shareLabel: REWARD_X_PROMOTION_AUTO_COPY[locale].connectX,
                    onShare: () => window.location.assign(
                      `/api/rewards/x-promotion/x-connect/start?inviteCode=${encodeURIComponent(earlyTransfer.inviteCode)}`,
                    ),
                  }
                : current
            );
          }
          return;
        }

        const promotionUrl = rewardXPromotionShareUrl({
          referralUrl,
          shareToken: offer.shareToken,
        });
        const intentUrl = promotionUrl
          ? rewardReceiptXIntentUrl({
              locale,
              amountB3tr: feedback.amountB3tr,
              referralUrl: promotionUrl,
            })
          : '';
        if (!intentUrl) return;

        const deadline = Date.parse(offer.postDeadlineAt);
        shareReady = true;
        setFeedback(current =>
          current?.kind === 'reward' && current.id === earlyTransfer.feedbackId
            ? {
                ...current,
                shareLabel:
                  `${rewardReceiptShareLabel(locale)} · +${offer.amountB3tr} B3TR`,
                onShare: () => {
                  if (Date.now() >= deadline) return;
                  window.open(intentUrl, '_blank', 'noopener,noreferrer');
                  setFeedback(visible =>
                    visible?.kind === 'reward' && visible.id === earlyTransfer.feedbackId
                      ? {
                          ...visible,
                          text: body.xUrlLessEnabled
                            ? REWARD_X_PROMOTION_AUTO_COPY[locale].autoShareFollowupBody
                            : REWARD_X_PROMOTION_COPY[locale].shareFollowupBody,
                        }
                      : visible,
                  );
                },
              }
            : current,
        );
        // Retire a stale button when the immutable offer window expires.
        shareExpiryTimer = setTimeout(() => {
          setFeedback(current => current?.kind === 'reward' &&
            current.id === earlyTransfer.feedbackId
            ? { ...current, shareLabel: undefined, onShare: undefined }
            : current);
        }, Math.max(1, Math.min(deadline - Date.now() + 100, 86_400_000)));
        return;
      } catch {
        // Bonus discovery is optional: payment or transfer feedback is intact.
      } finally {
        if (!cancelled && !shareReady && Date.now() - startedAt < 120_000) {
          // Stop once a valid OPEN bonus button has been added by the server.
          timer = setTimeout(() => void refresh(), 5_000);
        }
      }
    };

    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (shareExpiryTimer) clearTimeout(shareExpiryTimer);
    };
  }, [
    earlyTransfer,
    feedback?.id,
    feedback?.kind,
    locale,
    referralLink,
    referralLinkVerified,
    setFeedback,
    wallet,
  ]);
}
