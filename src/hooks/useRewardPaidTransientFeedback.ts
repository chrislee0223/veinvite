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
  buildRewardXPromotionIntentUrl,
  loadRewardXPromotion,
  openRewardXPromotionOpportunity,
} from '@/lib/rewards/rewardXPromotionClient';
import { buildProductionSharePageUrl } from '@/lib/socialShareCard';

const REWARD_RECEIPT_ACKNOWLEDGED_EVENT =
  'veinvite-reward-receipt-acknowledged';

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

    // Keep the existing referral-link readiness boundary, but never make the
    // confirmed payout notice wait on optional X-promotion network work.
    if (!shareReady && !shareUnavailable) return;

    const payload = pendingReward;
    feedbackIdRef.current += 1;
    const feedbackId =
      feedbackIdRef.current;

    setFeedback({
      id: feedbackId,
      kind: 'reward',
      title:
        NOTIFICATION_COPY[
          locale
        ].rewardTitle,
      text: REWARD_RECEIPT_COPY[locale].description,
      amountB3tr: payload.amountB3tr,
      confirmLabel:
        NOTIFICATION_COPY[
          locale
        ].confirm,
      onConfirm: () => {
        if (wallet) {
          clearRewardPaidToast(wallet, payload.receiptId);
          setPendingReward(readRewardPaidToast(wallet));
        }
        return acknowledgeReward(
          payload,
        );
      },
    });
    setPendingReward(null);

    if (!shareReady || !referralLink) {
      return;
    }

    const rewardShareUrl =
      buildProductionSharePageUrl(
        's',
        referralLink.key,
      );
    const ordinaryIntentUrl =
      rewardReceiptXIntentUrl({
        locale,
        amountB3tr: payload.amountB3tr,
        referralUrl:
          rewardShareUrl,
      });

    const resolveShareAction =
      async () => {
        let shareIntentUrl = '';
        let shareLabel = '';

        try {
          let snapshot =
            await loadRewardXPromotion(
              payload.inviteCode,
            );

          if (
            snapshot.newOffersEnabled &&
            snapshot.offerStatus ===
              'PREPARING'
          ) {
            await openRewardXPromotionOpportunity(
              payload.inviteCode,
            );
            snapshot =
              await loadRewardXPromotion(
                payload.inviteCode,
              );
          }

          const promotion =
            snapshot.promotion;

          if (
            promotion?.state ===
              'OPEN' &&
            promotion.shareToken
          ) {
            shareIntentUrl =
              buildRewardXPromotionIntentUrl({
                locale,
                baseRewardAmountB3tr:
                  payload.amountB3tr,
                rewardShareUrl,
                shareToken:
                  promotion.shareToken,
              });
            shareLabel =
              REWARD_X_PROMOTION_COPY[
                locale
              ].shareBonus.replace(
                '{amount}',
                promotion.amountB3tr,
              );
          } else if (
            !promotion &&
            (
              !snapshot.newOffersEnabled ||
              snapshot.offerStatus ===
                'DISABLED' ||
              snapshot.offerStatus ===
                'NOT_ELIGIBLE' ||
              snapshot.offerStatus ===
                'CLOSED'
            )
          ) {
            shareIntentUrl =
              ordinaryIntentUrl;
            shareLabel =
              rewardReceiptShareLabel(
                locale,
              );
          } else if (
            promotion &&
            (
              promotion.state ===
                'EXPIRED' ||
              promotion.state ===
                'RELEASED' ||
              promotion.state ===
                'PAID'
            )
          ) {
            shareIntentUrl =
              ordinaryIntentUrl;
            shareLabel =
              rewardReceiptShareLabel(
                locale,
              );
          }
          // PREPARING, grace, verification, retention and payout-pending
          // states intentionally expose no generic share CTA. Such a Post
          // would not contain a currently usable promotion token.
        } catch (error) {
          console.warn(
            'VeInvite X promotion popup state could not be resolved:',
            error,
          );
          // Optional share enhancement fails closed. The already-rendered
          // core payout confirmation remains unaffected.
        }

        if (
          !shareIntentUrl ||
          !shareLabel
        ) {
          return;
        }

        setFeedback((current) => {
          if (
            !current ||
            current.kind !==
              'reward' ||
            current.id !==
              feedbackId
          ) {
            return current;
          }

          return {
            ...current,
            shareLabel,
            onShare: () => {
              window.open(
                shareIntentUrl,
                '_blank',
                'noopener,noreferrer',
              );
            },
          };
        });
      };

    void resolveShareAction();
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
