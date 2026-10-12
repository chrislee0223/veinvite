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
} from '@/lib/rewards/rewardReceiptShare';
import {
  buildRewardXPromotionShareUrl,
  parseRewardXPromotionSnapshot,
} from '@/lib/rewards/rewardXPromotionClient';
import { buildProductionSharePageUrl } from '@/lib/socialShareCard';

const REWARD_RECEIPT_ACKNOWLEDGED_EVENT =
  'veinvite-reward-receipt-acknowledged';
const PROMOTION_STATE_TIMEOUT_MS = 1_500;

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

    // If the referral link is still being verified, wait before showing the
    // payout confirmation so we do not flash a share action that immediately
    // changes shape.
    if (!shareReady && !shareUnavailable) return;

    const payload = pendingReward;
    let cancelled = false;

    const showRewardFeedback = async () => {
      let shareIntentUrl = '';
      let shareLabel = '';

      if (shareReady) {
        const referralUrl =
          buildProductionSharePageUrl(
            's',
            referralLink.key,
          );

        // Resolve the optional X promotion state before choosing the share
        // action. A LIVE promotion must never fall back to the generic link,
        // because that link does not carry the one-time xp token.
        try {
          const controller = new AbortController();
          const timer = window.setTimeout(
            () => controller.abort(),
            PROMOTION_STATE_TIMEOUT_MS,
          );

          try {
            const response = await fetch(
              `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(payload.inviteCode)}`,
              {
                method: 'GET',
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: controller.signal,
              },
            );

            if (response.ok) {
              const body = await response.json() as {
                promotion?: unknown;
              };

              if (body.promotion === null) {
                shareIntentUrl =
                  rewardReceiptXIntentUrl({
                    locale,
                    amountB3tr: payload.amountB3tr,
                    referralUrl,
                  });
                shareLabel =
                  rewardReceiptShareLabel(locale);
              } else {
                const promotion =
                  parseRewardXPromotionSnapshot(
                    body.promotion,
                  );

                if (
                  promotion?.inviteCode ===
                    payload.inviteCode &&
                  promotion.state === 'OPEN' &&
                  promotion.shareToken
                ) {
                  const promotionUrl =
                    buildRewardXPromotionShareUrl(
                      referralUrl,
                      promotion.shareToken,
                    );

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
                      REWARD_X_PROMOTION_COPY[
                        locale
                      ].shareBonus.replace(
                        '{amount}',
                        promotion.amountB3tr,
                      );
                  }
                }
              }
            }
          } finally {
            window.clearTimeout(timer);
          }
        } catch {
          // Uncertain promotion state fails closed for sharing only. The
          // already-paid referral confirmation must still be shown.
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
        amountB3tr: payload.amountB3tr,
        ...(shareIntentUrl && shareLabel
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

    void showRewardFeedback();

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
