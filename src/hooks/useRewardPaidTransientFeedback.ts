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
import type { SupportedLocale } from '@/lib/i18n/locales';
import {
  clearRewardPaidToast,
  readRewardPaidToast,
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

const REWARD_RECEIPT_ACKNOWLEDGED_EVENT =
  'veinvite-reward-receipt-acknowledged';

type RewardXPromotionPopupState = {
  newOffersEnabled?: boolean;
  promotionPending?: boolean;
  promotion?: {
    state?: string;
    amountB3tr?: string;
    shareToken?: string | null;
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
  const feedbackIdRef = useRef(0);

  useEffect(() => {
    setFeedback((current) =>
      current?.kind === 'reward' ? null : current,
    );
    setPendingReward(
      wallet ? readRewardPaidToast(wallet) : null,
    );
  }, [setFeedback, wallet]);

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

    const shareReady =
      referralLinkVerified && referralLink !== null;
    const shareUnavailable =
      referralLinkFailed && !shareReady;

    // Keep the payout confirmation usable even when the permanent referral
    // link is unavailable. X sharing is optional and must never block the
    // actual paid-reward feedback.
    if (!shareReady && !shareUnavailable) return;

    let cancelled = false;
    const payload = pendingReward;

    const prepareFeedback = async () => {
      let shareIntentUrl = '';
      let shareLabel = '';

      if (shareReady && referralLink) {
        const referralUrl =
          buildProductionSharePageUrl(
            's',
            referralLink.key,
          );

        try {
          const response = await fetch(
            `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(payload.inviteCode)}`,
            {
              cache: 'no-store',
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

          if (response.ok) {
            const promotion =
              body.promotion ?? null;

            if (
              promotion?.state === 'OPEN' &&
              typeof promotion.shareToken === 'string' &&
              typeof promotion.amountB3tr === 'string'
            ) {
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
          }
        } catch {
          // Fail closed for optional sharing. The payout confirmation itself
          // is still shown, but we never guess whether a promotion token is
          // required.
        }
      }

      if (cancelled) return;

      feedbackIdRef.current += 1;
      setFeedback({
        id: feedbackIdRef.current,
        kind: 'reward',
        title:
          NOTIFICATION_COPY[locale].rewardTitle,
        text:
          REWARD_RECEIPT_COPY[locale].description,
        amountB3tr:
          payload.amountB3tr,
        ...(shareIntentUrl
          ? {
              shareLabel,
              onShare: () => {
                window.open(
                  shareIntentUrl,
                  '_blank',
                  'noopener,noreferrer',
                );
              },
            }
          : {}),
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
    };

    void prepareFeedback();

    return () => {
      cancelled = true;
    };
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
}
