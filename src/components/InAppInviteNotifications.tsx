'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { InviteNotificationSurfaceV2 } from './InviteNotificationSurfaceV2';
import { useWalletLauncher } from './WalletControl';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import type { Locale } from '@/lib/i18n/locales';
import type {
  InviteNotificationPayloadV2,
} from '@/lib/notifications/inviteNotificationStateV2';

type NotificationResponse = {
  notification?: InviteNotificationPayloadV2 | null;
  notifications?: InviteNotificationPayloadV2[];
  unreadCount?: number;
  error?: string;
};

const REFRESH_MS = 60_000;
const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';
const REWARD_RECEIPT_ACKNOWLEDGED_EVENT =
  'veinvite-reward-receipt-acknowledged';

function notificationSetKey(
  notifications: InviteNotificationPayloadV2[],
): string {
  return notifications
    .map((item) =>
      `${item.inviteCode}:${item.kind}:${item.stage}:${item.dappProgress ?? '-'}:${item.eventAt}`,
    )
    .join('|');
}

export function InAppInviteNotifications({
  locale,
}: {
  locale: Locale;
}) {
  const { wallet } = useWalletLauncher();
  const [notifications, setNotifications] =
    useState<InviteNotificationPayloadV2[]>([]);
  const [open, setOpen] = useState(false);
  const [acknowledging, setAcknowledging] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState('');
  const shownKeyRef = useRef<string | null>(null);
  const copy = NOTIFICATION_COPY[locale];

  const invalidateWalletSession = useCallback(() => {
    setNotifications([]);
    setOpen(false);
    setErrorMessage('');
    shownKeyRef.current = null;
    window.dispatchEvent(
      new Event(WALLET_SESSION_INVALID_EVENT),
    );
  }, []);

  const refresh = useCallback(
    async (autoOpen: boolean) => {
      if (!wallet) {
        setNotifications([]);
        setOpen(false);
        shownKeyRef.current = null;
        return;
      }

      try {
        const response = await fetch(
          '/api/notifications',
          { cache: 'no-store' },
        );

        if (response.status === 401) {
          invalidateWalletSession();
          return;
        }

        const body =
          (await response.json()) as NotificationResponse;

        if (!response.ok) {
          throw new Error(
            body.error || 'Notification request failed.',
          );
        }

        const next = Array.isArray(body.notifications)
          ? body.notifications
          : body.notification
            ? [body.notification]
            : [];

        setNotifications(next);

        if (next.length < 1) return;

        const key = notificationSetKey(next);
        if (autoOpen && shownKeyRef.current !== key) {
          shownKeyRef.current = key;
          setErrorMessage('');
          setOpen(true);
        }
      } catch (error) {
        console.warn(
          'VeInvite notification refresh failed:',
          error,
        );
      }
    },
    [invalidateWalletSession, wallet],
  );

  const acknowledgeAndClose = useCallback(
    async () => {
      if (notifications.length < 1 || acknowledging) {
        return;
      }

      const refreshHomeAfterAcknowledgement =
        notifications.some(
          (notification) =>
            notification.kind === 'INVITE_INELIGIBLE' ||
            notification.kind === 'REWARD_READY',
        );

      setAcknowledging(true);
      setErrorMessage('');

      try {
        const response = await fetch(
          '/api/notifications',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              acknowledgements: notifications.map(
                (notification) => ({
                  inviteCode: notification.inviteCode,
                  stage: notification.stage,
                  dappProgress: notification.dappProgress,
                  rewardReady:
                    notification.kind === 'REWARD_READY',
                }),
              ),
            }),
          },
        );

        if (response.status === 401) {
          invalidateWalletSession();
          return;
        }

        const body =
          (await response.json()) as {
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            body.error || copy.acknowledgementError,
          );
        }

        setOpen(false);
        setNotifications([]);

        if (refreshHomeAfterAcknowledgement) {
          window.location.reload();
          return;
        }

        await refresh(false);
      } catch (error) {
        console.warn(
          'VeInvite notification acknowledgement failed:',
          error,
        );
        setErrorMessage(
          copy.acknowledgementError,
        );
      } finally {
        setAcknowledging(false);
      }
    },
    [
      acknowledging,
      copy.acknowledgementError,
      invalidateWalletSession,
      notifications,
      refresh,
    ],
  );

  useEffect(() => {
    void refresh(true);

    if (!wallet) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh(true);
      }
    }, REFRESH_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh(true);
      }
    };

    document.addEventListener(
      'visibilitychange',
      onVisibilityChange,
    );

    return () => {
      window.clearInterval(timer);
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      );
    };
  }, [wallet, refresh]);

  useEffect(() => {
    const onRewardReceiptAcknowledged = () => {
      setOpen(false);
      setErrorMessage('');
      void refresh(false);
    };

    window.addEventListener(
      REWARD_RECEIPT_ACKNOWLEDGED_EVENT,
      onRewardReceiptAcknowledged,
    );

    return () => {
      window.removeEventListener(
        REWARD_RECEIPT_ACKNOWLEDGED_EVENT,
        onRewardReceiptAcknowledged,
      );
    };
  }, [refresh]);

  if (!wallet) return null;

  return (
    <InviteNotificationSurfaceV2
      locale={locale}
      notifications={notifications}
      open={open}
      busy={acknowledging}
      errorMessage={errorMessage}
      onOpen={() => {
        if (notifications.length > 0) {
          setErrorMessage('');
          setOpen(true);
        }
      }}
      onClose={acknowledgeAndClose}
    />
  );
}
