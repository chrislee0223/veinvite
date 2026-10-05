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
import { rewardPaidNotificationBody } from '@/lib/i18n/rewardPaidNotificationCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';
import {
  consumeRewardPaidToast,
  type RewardPaidToastPayload,
} from '@/lib/notifications/rewardPaidToast';
import type { ReferralLinkRecord } from '@/lib/referralLinks';
import {
  rewardReceiptShareLabel,
  rewardReceiptXIntentUrl,
} from '@/lib/rewards/rewardReceiptShare';

const REWARD_RECEIPT_ACKNOWLEDGED_EVENT =
  'veinvite-reward-receipt-acknowledged';

export function useRewardPaidTransientFeedback({
  wallet,
  locale,
  referralLink,
  referralLinkVerified,
  setFeedback,
}: {
  wallet: string | null;
  locale: SupportedLocale;
  referralLink: ReferralLinkRecord | null;
  referralLinkVerified: boolean;
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
      wallet ? consumeRewardPaidToast(wallet) : null,
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
    if (
      !pendingReward ||
      !referralLinkVerified ||
      !referralLink
    ) {
      return;
    }

    const payload = pendingReward;
    const referralUrl =
      `https://veinvite.vercel.app/s/${encodeURIComponent(referralLink.key)}`;
    const shareIntentUrl = rewardReceiptXIntentUrl({
      locale,
      amountB3tr: payload.amountB3tr,
      referralUrl,
    });

    feedbackIdRef.current += 1;
    setFeedback({
      id: feedbackIdRef.current,
      kind: 'reward',
      title: NOTIFICATION_COPY[locale].rewardTitle,
      text: rewardPaidNotificationBody(locale, payload.amountB3tr),
      amountB3tr: payload.amountB3tr,
      shareLabel: rewardReceiptShareLabel(locale),
      confirmLabel: NOTIFICATION_COPY[locale].confirm,
      onShare: () => {
        window.open(
          shareIntentUrl,
          '_blank',
          'noopener,noreferrer',
        );
        void acknowledgeReward(payload);
      },
      onConfirm: () => acknowledgeReward(payload),
    });
    setPendingReward(null);
  }, [
    acknowledgeReward,
    locale,
    pendingReward,
    referralLink,
    referralLinkVerified,
    setFeedback,
  ]);
}
