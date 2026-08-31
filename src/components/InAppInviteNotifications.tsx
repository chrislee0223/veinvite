'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  InviteNotificationSurface,
  type InviteNotificationPayload,
} from './InviteNotificationSurface';
import { useWalletLauncher } from './WalletControl';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import type { Locale } from '@/lib/i18n/locales';

type NotificationResponse = {
  notification?: InviteNotificationPayload | null;
  unreadCount?: number;
  error?: string;
};

const REFRESH_MS = 60_000;

export function InAppInviteNotifications({
  locale,
}: {
  locale: Locale;
}) {
  const { wallet } = useWalletLauncher();
  const [notification, setNotification] =
    useState<InviteNotificationPayload | null>(null);
  const [unreadCount, setUnreadCount] =
    useState(0);
  const [open, setOpen] = useState(false);
  const [acknowledging, setAcknowledging] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState('');
  const shownKeyRef = useRef<string | null>(null);
  const copy = NOTIFICATION_COPY[locale];

  const refresh = useCallback(
    async (autoOpen: boolean) => {
      if (!wallet) {
        setNotification(null);
        setUnreadCount(0);
        setOpen(false);
        shownKeyRef.current = null;
        return;
      }

      try {
        const response = await fetch(
          '/api/notifications',
          { cache: 'no-store' },
        );
        const body =
          (await response.json()) as NotificationResponse;

        if (!response.ok) {
          throw new Error(
            body.error || 'Notification request failed.',
          );
        }

        const next = body.notification ?? null;
        setNotification(next);
        setUnreadCount(
          Math.max(0, body.unreadCount ?? 0),
        );

        if (!next) {
          return;
        }

        const key = `${next.inviteCode}:${next.stage}`;
        if (
          autoOpen &&
          shownKeyRef.current !== key
        ) {
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
    [wallet],
  );

  const acknowledgeAndClose = useCallback(
    async () => {
      if (!notification || acknowledging) {
        return;
      }

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
              inviteCode: notification.inviteCode,
              stage: notification.stage,
            }),
          },
        );
        const body =
          (await response.json()) as {
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            body.error ||
              copy.acknowledgementError,
          );
        }

        setOpen(false);
        setNotification(null);
        setUnreadCount((current) =>
          Math.max(0, current - 1),
        );
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
      notification,
      refresh,
    ],
  );

  useEffect(() => {
    void refresh(true);

    if (!wallet) {
      return;
    }

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

  if (!wallet) {
    return null;
  }

  return (
    <InviteNotificationSurface
      locale={locale}
      notification={notification}
      unreadCount={unreadCount}
      open={open}
      busy={acknowledging}
      errorMessage={errorMessage}
      onOpen={() => {
        if (notification) {
          setErrorMessage('');
          setOpen(true);
        }
      }}
      onClose={acknowledgeAndClose}
    />
  );
}
