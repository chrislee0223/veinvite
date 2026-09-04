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

type HistoryPage = {
  items: InviteNotificationHistoryItem[];
  unreadCount: number;
  nextCursor: string | null;
};

const REFRESH_MS = 60_000;
const HISTORY_PAGE_SIZE = 30;
const HISTORY_CACHE_PREFIX = 'veinvite:notification-history:v1:';
const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';
const REWARD_RECEIPT_ACKNOWLEDGED_EVENT =
  'veinvite-reward-receipt-acknowledged';
const REWARD_RESERVATION_READY_EVENT =
  'veinvite-reward-reservation-ready';
const NOTIFICATION_HISTORY_ACKNOWLEDGED_EVENT =
  'veinvite-notification-history-acknowledged';
const NOTIFICATION_HISTORY_KINDS = new Set([
  'INVITE_ACCEPTED',
  'DAPP_PROGRESS',
  'VOT3_CONVERTED',
  'REWARD_READY',
  'REWARD_PAID',
  'INVITE_INELIGIBLE',
]);

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

function historyCacheKey(wallet: string): string {
  return `${HISTORY_CACHE_PREFIX}${wallet.toLowerCase()}`;
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isCachedHistoryItem(
  value: unknown,
): value is InviteNotificationHistoryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    /^[1-9][0-9]*$/.test(item.id) &&
    typeof item.inviteCode === 'string' &&
    typeof item.kind === 'string' &&
    NOTIFICATION_HISTORY_KINDS.has(item.kind) &&
    typeof item.stage === 'number' &&
    Number.isFinite(item.stage) &&
    typeof item.eventAt === 'string' &&
    isNullableString(item.rewardAmountWei) &&
    (item.dappProgress === null ||
      (typeof item.dappProgress === 'number' &&
        Number.isFinite(item.dappProgress))) &&
    typeof item.collapsedProgress === 'boolean' &&
    isNullableString(item.friendWallet) &&
    isNullableString(item.readAt)
  );
}

function readHistoryCache(wallet: string): HistoryPage | null {
  try {
    const raw = window.sessionStorage.getItem(historyCacheKey(wallet));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(parsed.items)) return null;
    if (!parsed.items.every(isCachedHistoryItem)) return null;
    if (
      typeof parsed.unreadCount !== 'number' ||
      !Number.isFinite(parsed.unreadCount) ||
      parsed.unreadCount < 0
    ) {
      return null;
    }
    if (
      parsed.nextCursor !== null &&
      typeof parsed.nextCursor !== 'string'
    ) {
      return null;
    }

    return {
      items: parsed.items,
      unreadCount: Math.max(0, Math.floor(parsed.unreadCount)),
      nextCursor: parsed.nextCursor as string | null,
    };
  } catch {
    return null;
  }
}

function writeHistoryCache(wallet: string, history: HistoryPage): void {
  try {
    window.sessionStorage.setItem(
      historyCacheKey(wallet),
      JSON.stringify(history),
    );
  } catch {
    // Notification history still works without a warm browser cache.
  }
}

function clearHistoryCache(wallet: string): void {
  try {
    window.sessionStorage.removeItem(historyCacheKey(wallet));
  } catch {
    // Ignore browsers that disable session storage.
  }
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
  const latestHistoryRequestRef =
    useRef<Promise<HistoryPage | null> | null>(null);
  const lifecycleRefreshRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    activeWalletRef.current = wallet;
    const cached = wallet ? readHistoryCache(wallet) : null;
    setItems(cached?.items ?? []);
    setUnreadCount(cached?.unreadCount ?? 0);
    setNextCursor(cached?.nextCursor ?? null);
    setOpen(false);
    setLoading(false);
    setBusy(false);
    setErrorMessage('');
    shownKeyRef.current = null;
    openSnapshotRef.current = null;
    latestHistoryRequestRef.current = null;
    lifecycleRefreshRef.current = null;
  }, [wallet]);

  const invalidateWalletSession = useCallback(() => {
    if (activeWalletRef.current) {
      clearHistoryCache(activeWalletRef.current);
    }
    setItems([]);
    setUnreadCount(0);
    setNextCursor(null);
    setOpen(false);
    setLoading(false);
    setBusy(false);
    setErrorMessage('');
    shownKeyRef.current = null;
    openSnapshotRef.current = null;
    latestHistoryRequestRef.current = null;
    lifecycleRefreshRef.current = null;
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
    }): Promise<HistoryPage | null> => {
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

  const applyLatestHistory = useCallback(
    (history: HistoryPage, requestWallet: string) => {
      setItems(history.items);
      setUnreadCount(history.unreadCount);
      setNextCursor(history.nextCursor);
      writeHistoryCache(requestWallet, history);
    },
    [],
  );

  const loadLatestHistory = useCallback(
    async ({
      requestWallet,
      visibleLoading = false,
      surfaceError = false,
    }: {
      requestWallet: string;
      visibleLoading?: boolean;
      surfaceError?: boolean;
    }): Promise<HistoryPage | null> => {
      if (visibleLoading) setLoading(true);
      if (surfaceError) setErrorMessage('');

      let request = latestHistoryRequestRef.current;
      if (!request) {
        request = loadHistoryPage({ requestWallet });
        latestHistoryRequestRef.current = request;
      }

      try {
        const history = await request;
        if (
          history &&
          sameWallet(activeWalletRef.current, requestWallet)
        ) {
          applyLatestHistory(history, requestWallet);
          if (surfaceError) setErrorMessage('');
        }
        return history;
      } catch (error) {
        console.warn(
          'VeInvite notification history load failed:',
          error,
        );
        if (
          surfaceError &&
          sameWallet(activeWalletRef.current, requestWallet)
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Notification history request failed.',
          );
        }
        return null;
      } finally {
        if (latestHistoryRequestRef.current === request) {
          latestHistoryRequestRef.current = null;
        }
        if (
          visibleLoading &&
          sameWallet(activeWalletRef.current, requestWallet)
        ) {
          setLoading(false);
        }
      }
    },
    [applyLatestHistory, loadHistoryPage],
  );

  const refreshLifecycle = useCallback(
    async (autoOpen: boolean) => {
      if (!wallet) return;

      if (lifecycleRefreshRef.current) {
        await lifecycleRefreshRef.current;
        return;
      }

      const requestWallet = wallet;
      const task = (async () => {
        try {
          // Lifecycle derivation/materialization can be heavier than reading the
          // already-persisted history. Keep it in the background so opening the
          // bell never waits for this path.
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

          if (currentNotifications.length < 1) return;

          // If a fast history prefetch was already running, let that older read
          // finish before fetching the newly materialized history. This prevents
          // a stale response from overwriting the fresh milestone afterwards.
          const pendingHistory = latestHistoryRequestRef.current;
          if (pendingHistory) {
            try {
              await pendingHistory;
            } catch {
              // The fresh read below is authoritative for this lifecycle pass.
            }
          }

          const history = await loadHistoryPage({ requestWallet });
          if (!history) return;

          applyLatestHistory(history, requestWallet);
          setErrorMessage('');

          const key = notificationSetKey(currentNotifications);
          if (autoOpen && shownKeyRef.current !== key) {
            shownKeyRef.current = key;
            openSnapshotRef.current = newestHistoryId(history.items);
            setOpen(true);
          }
        } catch (error) {
          console.warn(
            'VeInvite notification lifecycle refresh failed:',
            error,
          );
        }
      })();

      lifecycleRefreshRef.current = task;
      try {
        await task;
      } finally {
        if (lifecycleRefreshRef.current === task) {
          lifecycleRefreshRef.current = null;
        }
      }
    },
    [
      applyLatestHistory,
      invalidateWalletSession,
      loadHistoryPage,
      wallet,
    ],
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
        const nextUnreadCount = Math.max(0, unreadCount - 1);
        setItems((current) => {
          const updated = current.map((item) =>
            item.id === id && item.readAt === null
              ? { ...item, readAt: now }
              : item,
          );
          if (wallet) {
            writeHistoryCache(wallet, {
              items: updated,
              unreadCount: nextUnreadCount,
              nextCursor,
            });
          }
          return updated;
        });
        setUnreadCount(nextUnreadCount);
        window.dispatchEvent(
          new Event(NOTIFICATION_HISTORY_ACKNOWLEDGED_EVENT),
        );

        if (refreshHomeAfterAcknowledgement) {
          window.location.reload();
          return;
        }

        if (wallet) {
          void loadLatestHistory({ requestWallet: wallet });
          void refreshLifecycle(false);
        }
      } catch (error) {
        console.warn(
          'VeInvite notification history acknowledgement failed:',
          error,
        );
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Notification acknowledgement failed.',
        );
      } finally {
        setBusy(false);
      }
    },
    [
      acknowledge,
      busy,
      items,
      loadLatestHistory,
      nextCursor,
      refreshLifecycle,
      unreadCount,
      wallet,
    ],
  );

  const markAllRead = useCallback(async () => {
    if (busy || unreadCount < 1) return;
    const throughId = openSnapshotRef.current;
    if (!throughId) return;

    const unreadThroughSnapshot = items.filter((notification) =>
      notification.readAt === null &&
      historyIdAtOrBefore(notification.id, throughId),
    );
    const refreshHomeAfterAcknowledgement =
      unreadThroughSnapshot.some(notificationRequiresHomeRefresh);

    setBusy(true);
    setErrorMessage('');

    try {
      const acknowledged = await acknowledge({ throughId });
      if (!acknowledged) return;

      const now = new Date().toISOString();
      const nextUnreadCount = Math.max(
        0,
        unreadCount - unreadThroughSnapshot.length,
      );
      setItems((current) => {
        const updated = current.map((item) =>
          item.readAt === null && historyIdAtOrBefore(item.id, throughId)
            ? { ...item, readAt: now }
            : item,
        );
        if (wallet) {
          writeHistoryCache(wallet, {
            items: updated,
            unreadCount: nextUnreadCount,
            nextCursor,
          });
        }
        return updated;
      });
      setUnreadCount(nextUnreadCount);
      window.dispatchEvent(
        new Event(NOTIFICATION_HISTORY_ACKNOWLEDGED_EVENT),
      );

      if (refreshHomeAfterAcknowledgement) {
        window.location.reload();
        return;
      }

      if (wallet) {
        void loadLatestHistory({ requestWallet: wallet });
        void refreshLifecycle(false);
      }
    } catch (error) {
      console.warn(
        'VeInvite mark-all notification history failed:',
        error,
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Notification acknowledgement failed.',
      );
    } finally {
      setBusy(false);
    }
  }, [
    acknowledge,
    busy,
    items,
    loadLatestHistory,
    nextCursor,
    refreshLifecycle,
    unreadCount,
    wallet,
  ]);

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
        error instanceof Error
          ? error.message
          : 'Notification history request failed.',
      );
    } finally {
      if (sameWallet(activeWalletRef.current, requestWallet)) {
        setLoading(false);
      }
    }
  }, [busy, loadHistoryPage, loading, nextCursor, wallet]);

  useEffect(() => {
    if (!wallet) return;

    const requestWallet = wallet;
    void loadLatestHistory({ requestWallet });
    void refreshLifecycle(true);

    const refreshVisibleNotifications = () => {
      if (document.visibilityState !== 'visible') return;
      void loadLatestHistory({ requestWallet });
      void refreshLifecycle(true);
    };

    const timer = window.setInterval(
      refreshVisibleNotifications,
      REFRESH_MS,
    );

    document.addEventListener(
      'visibilitychange',
      refreshVisibleNotifications,
    );

    return () => {
      window.clearInterval(timer);
      document.removeEventListener(
        'visibilitychange',
        refreshVisibleNotifications,
      );
    };
  }, [loadLatestHistory, refreshLifecycle, wallet]);

  useEffect(() => {
    const onRewardReceiptAcknowledged = () => {
      if (!wallet) return;
      void loadLatestHistory({ requestWallet: wallet });
      void refreshLifecycle(false);
    };
    const onRewardReservationReady = () => {
      void refreshLifecycle(true);
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
  }, [loadLatestHistory, refreshLifecycle, wallet]);

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
        setErrorMessage('');
        setOpen(true);

        if (items.length === 0) {
          void loadLatestHistory({
            requestWallet: wallet,
            surfaceError: true,
          }).then((history) => {
            if (
              history &&
              sameWallet(activeWalletRef.current, wallet)
            ) {
              openSnapshotRef.current = newestHistoryId(history.items);
            }
          });
        }

        // Reconcile any brand-new lifecycle milestone in the background. The
        // warm/persisted history is visible immediately and never waits here.
        void refreshLifecycle(false);
      }}
      onClose={() => setOpen(false)}
      onRetry={() => {
        void loadLatestHistory({
          requestWallet: wallet,
          visibleLoading: true,
          surfaceError: true,
        });
        void refreshLifecycle(false);
      }}
      onMarkRead={markRead}
      onMarkAll={markAllRead}
      onLoadMore={loadMore}
    />
  );
}
