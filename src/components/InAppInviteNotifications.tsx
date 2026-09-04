'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { InviteNotificationHistoryCenter } from './InviteNotificationHistoryCenter';
import { useWalletLauncher } from './WalletControl';
import type { Locale } from '@/lib/i18n/locales';
import type {
  InviteNotificationHistoryItem,
  InviteNotificationHistoryResponse,
} from '@/lib/notifications/inviteNotificationHistory';
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
const HISTORY_PAGE_SIZE = 30;
const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';
const REWARD_RECEIPT_ACKNOWLEDGED_EVENT =
  'veinvite-reward-receipt-acknowledged';
const REWARD_RESERVATION_READY_EVENT =
  'veinvite-reward-reservation-ready';
const NOTIFICATION_HISTORY_ACKNOWLEDGED_EVENT =
  'veinvite-notification-history-acknowledged';

function notificationSetKey(
  notifications: InviteNotificationPayloadV2[],
): string {
  return notifications
    .map((item) =>
      `${item.inviteCode}:${item.kind}:${item.stage}:${item.dappProgress ?? '-'}:${item.eventAt}`,
    )
    .join('|');
}

function sameWallet(left: string | null, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}

function newestHistoryId(
  items: InviteNotificationHistoryItem[],
): string | null {
  let latest: bigint | null = null;

  for (const item of items) {
    try {
      const id = BigInt(item.id);
      if (id > 0n && (latest === null || id > latest)) {
        latest = id;
      }
    } catch {
      // Invalid server ids are rejected by the history API. Ignore defensively.
    }
  }

  return latest?.toString() ?? null;
}

function historyIdAtOrBefore(id: string, throughId: string): boolean {
  try {
    return BigInt(id) <= BigInt(throughId);
  } catch {
    return false;
  }
}

function notificationRequiresHomeRefresh(
  notification: InviteNotificationHistoryItem,
): boolean {
  return (
    notification.kind === 'INVITE_INELIGIBLE' ||
    notification.kind === 'REWARD_READY' ||
    notification.kind === 'REWARD_PAID'
  );
}

export function InAppInviteNotifications({
  locale,
}: {
  locale: Locale;
}) {
  const { wallet } = useWalletLauncher();
  const [items, setItems] =
    useState<InviteNotificationHistoryItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] =
    useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const shownKeyRef = useRef<string | null>(null);
  const openSnapshotRef = useRef<string | null>(null);
  const activeWalletRef = useRef<string | null>(wallet);

  useEffect(() => {
    activeWalletRef.current = wallet;
    setItems([]);
    setUnreadCount(0);
    setNextCursor(null);
    setOpen(false);
    setLoading(false);
    setBusy(false);
    setErrorMessage('');
    shownKeyRef.current = null;
    openSnapshotRef.current = null;
  }, [wallet]);

  const invalidateWalletSession = useCallback(() => {
    setItems([]);
    setUnreadCount(0);
    setNextCursor(null);
    setOpen(false);
    setLoading(false);
    setBusy(false);
    setErrorMessage('');
    shownKeyRef.current = null;
    openSnapshotRef.current = null;
    window.dispatchEvent(
      new Event(WALLET_SESSION_INVALID_EVENT),
    );
  }, []);

  const loadHistoryPage = useCallback(
    async ({
      requestWallet,
      beforeId = null,
    }: {
      requestWallet: string;
      beforeId?: string | null;
    }) => {
      const params = new URLSearchParams({
        limit: String(HISTORY_PAGE_SIZE),
      });
      if (beforeId) params.set('beforeId', beforeId);

      const response = await fetch(
        `/api/notifications/history?${params.toString()}`,
        { cache: 'no-store' },
      );

      if (response.status === 401) {
        invalidateWalletSession();
        return null;
      }

      const body =
        (await response.json()) as InviteNotificationHistoryResponse;

      if (!response.ok) {
        throw new Error(
          body.error || 'Notification history request failed.',
        );
      }

      if (!sameWallet(activeWalletRef.current, requestWallet)) {
        return null;
      }

      return {
        items: Array.isArray(body.items) ? body.items : [],
        unreadCount:
          Number.isFinite(body.unreadCount)
            ? Math.max(0, Number(body.unreadCount))
            : 0,
        nextCursor:
          typeof body.nextCursor === 'string'
            ? body.nextCursor
            : null,
      };
    },
    [invalidateWalletSession],
  );

  const refresh = useCallback(
    async (autoOpen: boolean) => {
      if (!wallet) {
        setItems([]);
        setUnreadCount(0);
        setNextCursor(null);
        setOpen(false);
        shownKeyRef.current = null;
        openSnapshotRef.current = null;
        return;
      }

      const requestWallet = wallet;
      setLoading((current) => current || items.length === 0);
      setErrorMessage('');

      try {
        // Refresh the existing V2 lifecycle first. The server materializes only
        // the actual user-visible milestone into append-only history, so the
        // history center never has to reconstruct or replay raw chain events.
        const notificationResponse = await fetch(
          '/api/notifications',
          { cache: 'no-store' },
        );

        if (notificationResponse.status === 401) {
          invalidateWalletSession();
          return;
        }

        const notificationBody =
          (await notificationResponse.json()) as NotificationResponse;

        if (!notificationResponse.ok) {
          throw new Error(
            notificationBody.error || 'Notification request failed.',
          );
        }

        if (!sameWallet(activeWalletRef.current, requestWallet)) return;

        const currentNotifications =
          Array.isArray(notificationBody.notifications)
            ? notificationBody.notifications
            : notificationBody.notification
              ? [notificationBody.notification]
              : [];

        const history = await loadHistoryPage({ requestWallet });
        if (!history) return;

        setItems(history.items);
        setUnreadCount(history.unreadCount);
        setNextCursor(history.nextCursor);
        setErrorMessage('');

        if (currentNotifications.length > 0) {
          const key = notificationSetKey(currentNotifications);
          if (autoOpen && shownKeyRef.current !== key) {
            shownKeyRef.current = key;
            openSnapshotRef.current = newestHistoryId(history.items);
            setOpen(true);
          }
        }
      } catch (error) {
        console.warn(
          'VeInvite notification history refresh failed:',
          error,
        );
        if (sameWallet(activeWalletRef.current, requestWallet)) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Notification history request failed.',
          );
        }
      } finally {
        if (sameWallet(activeWalletRef.current, requestWallet)) {
          setLoading(false);
        }
      }
    },
    [invalidateWalletSession, items.length, loadHistoryPage, wallet],
  );

  const acknowledge = useCallback(
    async (payload: { ids: string[] } | { throughId: string }) => {
      if (!wallet) return false;
      const requestWallet = wallet;

      const response = await fetch(
        '/api/notifications/history',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.status === 401) {
        invalidateWalletSession();
        return false;
      }

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          body.error || 'Notification acknowledgement failed.',
        );
      }

      return sameWallet(activeWalletRef.current, requestWallet);
    },
    [invalidateWalletSession, wallet],
  );

  const markRead = useCallback(
    async (id: string) => {
      if (busy) return;
      const notification = items.find((item) => item.id === id);
      if (!notification || notification.readAt !== null) return;
      const refreshHomeAfterAcknowledgement =
        notificationRequiresHomeRefresh(notification);

      setBusy(true);
      setErrorMessage('');

      try {
        const acknowledged = await acknowledge({ ids: [id] });
        if (!acknowledged) return;

        const now = new Date().toISOString();
        setItems((current) =>
          current.map((item) =>
            item.id === id && item.readAt === null
              ? { ...item, readAt: now }
              : item,
          ),
        );
        setUnreadCount((current) => Math.max(0, current - 1));
        window.dispatchEvent(
          new Event(NOTIFICATION_HISTORY_ACKNOWLEDGED_EVENT),
        );

        if (refreshHomeAfterAcknowledgement) {
          window.location.reload();
          return;
        }

        await refresh(false);
      } catch (error) {
        console.warn(
          'VeInvite notification history acknowledgement failed:',
          error,
        );
        setErrorMessage(
          error instanceof Error ? error.message : 'Notification acknowledgement failed.',
        );
      } finally {
        setBusy(false);
      }
    },
    [acknowledge, busy, items, refresh],
  );

  const markAllRead = useCallback(async () => {
    if (busy || unreadCount < 1) return;
    const throughId = openSnapshotRef.current;
    if (!throughId) return;

    const refreshHomeAfterAcknowledgement = items.some((notification) =>
      notification.readAt === null &&
      historyIdAtOrBefore(notification.id, throughId) &&
      notificationRequiresHomeRefresh(notification),
    );

    setBusy(true);
    setErrorMessage('');

    try {
      const acknowledged = await acknowledge({ throughId });
      if (!acknowledged) return;

      const now = new Date().toISOString();
      setItems((current) =>
        current.map((item) =>
          item.readAt === null && historyIdAtOrBefore(item.id, throughId)
            ? { ...item, readAt: now }
            : item,
        ),
      );
      window.dispatchEvent(
        new Event(NOTIFICATION_HISTORY_ACKNOWLEDGED_EVENT),
      );

      if (refreshHomeAfterAcknowledgement) {
        window.location.reload();
        return;
      }

      await refresh(false);
    } catch (error) {
      console.warn(
        'VeInvite mark-all notification history failed:',
        error,
      );
      setErrorMessage(
        error instanceof Error ? error.message : 'Notification acknowledgement failed.',
      );
    } finally {
      setBusy(false);
    }
  }, [acknowledge, busy, items, refresh, unreadCount]);

  const loadMore = useCallback(async () => {
    if (!wallet || !nextCursor || loading || busy) return;
    const requestWallet = wallet;
    setLoading(true);
    setErrorMessage('');

    try {
      const page = await loadHistoryPage({
        requestWallet,
        beforeId: nextCursor,
      });
      if (!page) return;

      setItems((current) => {
        const byId = new Map(
          current.map((item) => [item.id, item]),
        );
        for (const item of page.items) byId.set(item.id, item);
        return [...byId.values()];
      });
      setUnreadCount(page.unreadCount);
      setNextCursor(page.nextCursor);
    } catch (error) {
      console.warn(
        'VeInvite older notification history load failed:',
        error,
      );
      setErrorMessage(
        error instanceof Error ? error.message : 'Notification history request failed.',
      );
    } finally {
      if (sameWallet(activeWalletRef.current, requestWallet)) {
        setLoading(false);
      }
    }
  }, [busy, loadHistoryPage, loading, nextCursor, wallet]);

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
      void refresh(false);
    };
    const onRewardReservationReady = () => {
      void refresh(true);
    };

    window.addEventListener(
      REWARD_RECEIPT_ACKNOWLEDGED_EVENT,
      onRewardReceiptAcknowledged,
    );
    window.addEventListener(
      REWARD_RESERVATION_READY_EVENT,
      onRewardReservationReady,
    );

    return () => {
      window.removeEventListener(
        REWARD_RECEIPT_ACKNOWLEDGED_EVENT,
        onRewardReceiptAcknowledged,
      );
      window.removeEventListener(
        REWARD_RESERVATION_READY_EVENT,
        onRewardReservationReady,
      );
    };
  }, [refresh]);

  if (!wallet) return null;

  return (
    <InviteNotificationHistoryCenter
      locale={locale}
      items={items}
      unreadCount={unreadCount}
      open={open}
      loading={loading}
      busy={busy}
      errorMessage={errorMessage}
      hasMore={Boolean(nextCursor)}
      onOpen={() => {
        openSnapshotRef.current = newestHistoryId(items);
        setOpen(true);
        if (items.length === 0) void refresh(false);
      }}
      onClose={() => setOpen(false)}
      onRetry={() => void refresh(false)}
      onMarkRead={markRead}
      onMarkAll={markAllRead}
      onLoadMore={loadMore}
    />
  );
}
