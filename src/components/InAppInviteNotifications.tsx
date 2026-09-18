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

type AcknowledgementResponse = {
  error?: string;
  unreadCount?: number;
};

type AcknowledgementResult = {
  unreadCount: number;
};

const REFRESH_MS = 60_000;
const LIFECYCLE_UNAUTHORIZED_BACKOFF_MS = 15_000;
const LIFECYCLE_REQUEST_LEASE_MS = 5_000;
const LIFECYCLE_UNAUTHORIZED_BACKOFF_STORAGE_KEY =
  'veinvite:notification-lifecycle-unauthorized-until:v1';
const LIFECYCLE_REQUEST_LEASE_STORAGE_KEY =
  'veinvite:notification-lifecycle-request-until:v1';
let lifecycleUnauthorizedUntil = 0;
let lifecycleRequestLeaseUntil = 0;
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
const HOME_DATA_REFRESH_REQUESTED_EVENT =
  'veinvite-home-data-refresh-requested';
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

function readLifecycleTimestamp(key: string): number {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeLifecycleTimestamp(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Module-scoped guards still protect the active page if storage is blocked.
  }
}

function lifecycleRefreshBackedOff(): boolean {
  lifecycleUnauthorizedUntil = Math.max(
    lifecycleUnauthorizedUntil,
    readLifecycleTimestamp(LIFECYCLE_UNAUTHORIZED_BACKOFF_STORAGE_KEY),
  );
  return Date.now() < lifecycleUnauthorizedUntil;
}

function backOffLifecycleAfterUnauthorized(): void {
  lifecycleUnauthorizedUntil =
    Date.now() + LIFECYCLE_UNAUTHORIZED_BACKOFF_MS;
  writeLifecycleTimestamp(
    LIFECYCLE_UNAUTHORIZED_BACKOFF_STORAGE_KEY,
    lifecycleUnauthorizedUntil,
  );
}

function acquireLifecycleRequestLease(): number | null {
  const now = Date.now();
  lifecycleRequestLeaseUntil = Math.max(
    lifecycleRequestLeaseUntil,
    readLifecycleTimestamp(LIFECYCLE_REQUEST_LEASE_STORAGE_KEY),
  );
  if (now < lifecycleRequestLeaseUntil) return null;

  const leaseUntil = now + LIFECYCLE_REQUEST_LEASE_MS;
  lifecycleRequestLeaseUntil = leaseUntil;
  writeLifecycleTimestamp(
    LIFECYCLE_REQUEST_LEASE_STORAGE_KEY,
    leaseUntil,
  );
  return leaseUntil;
}

function releaseLifecycleRequestLease(leaseUntil: number): void {
  if (lifecycleRequestLeaseUntil === leaseUntil) {
    lifecycleRequestLeaseUntil = 0;
  }

  try {
    if (
      Number(
        window.localStorage.getItem(
          LIFECYCLE_REQUEST_LEASE_STORAGE_KEY,
        ),
      ) === leaseUntil
    ) {
      window.localStorage.removeItem(
        LIFECYCLE_REQUEST_LEASE_STORAGE_KEY,
      );
    }
  } catch {
    // The short lease expires naturally even if storage cleanup is blocked.
  }
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
  const [presentationReady, setPresentationReady] = useState(false);
  const shownKeyRef = useRef<string | null>(null);
  const openSnapshotRef = useRef<string | null>(null);
  const activeWalletRef = useRef<string | null>(wallet);
  const historyResolvedRef = useRef(false);
  // Make the newest wallet visible to requests from the prior render before
  // effects run, so stale authorization failures cannot invalidate its session.
  activeWalletRef.current = wallet;
  const latestHistoryRequestRef =
    useRef<Promise<HistoryPage | null> | null>(null);
  const lifecycleRefreshRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    activeWalletRef.current = wallet;
    const cached = wallet ? readHistoryCache(wallet) : null;
    historyResolvedRef.current = cached !== null;
    setItems(cached?.items ?? []);
    setUnreadCount(cached?.unreadCount ?? 0);
    setNextCursor(cached?.nextCursor ?? null);
    setOpen(false);
    setLoading(false);
    setBusy(false);
    setErrorMessage('');
    setPresentationReady(false);
    shownKeyRef.current = null;
    openSnapshotRef.current = null;
    latestHistoryRequestRef.current = null;
    lifecycleRefreshRef.current = null;
  }, [wallet]);

  const invalidateWalletSession = useCallback((requestWallet: string) => {
    if (!sameWallet(activeWalletRef.current, requestWallet)) {
      return;
    }

    clearHistoryCache(requestWallet);
    historyResolvedRef.current = false;
    setItems([]);
    setUnreadCount(0);
    setNextCursor(null);
    setOpen(false);
    setLoading(false);
    setBusy(false);
    setErrorMessage('');
    setPresentationReady(false);
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
        if (!sameWallet(activeWalletRef.current, requestWallet)) {
          return null;
        }
        backOffLifecycleAfterUnauthorized();
        invalidateWalletSession(requestWallet);
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
      historyResolvedRef.current = true;
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
    async (autoOpen: boolean): Promise<boolean> => {
      if (!wallet || lifecycleRefreshBackedOff()) return false;

      if (lifecycleRefreshRef.current) {
        return await lifecycleRefreshRef.current;
      }

      const lifecycleLease = acquireLifecycleRequestLease();
      if (lifecycleLease === null) return false;

      const requestWallet = wallet;
      const task = (async (): Promise<boolean> => {
        try {
          // Materialize the current lifecycle first. The caller can then read
          // persisted history once, instead of exposing an older history read
          // and a second post-materialization read as two visible badge states.
          const notificationResponse = await fetch(
            '/api/notifications',
            { cache: 'no-store' },
          );

          if (notificationResponse.status === 401) {
            if (!sameWallet(activeWalletRef.current, requestWallet)) {
              return false;
            }
            backOffLifecycleAfterUnauthorized();
            invalidateWalletSession(requestWallet);
            return false;
          }

          const notificationBody =
            (await notificationResponse.json()) as NotificationResponse;

          if (!notificationResponse.ok) {
            throw new Error(
              notificationBody.error || 'Notification request failed.',
            );
          }

          if (!sameWallet(activeWalletRef.current, requestWallet)) return false;

          const currentNotifications =
            Array.isArray(notificationBody.notifications)
              ? notificationBody.notifications
              : notificationBody.notification
                ? [notificationBody.notification]
                : [];

          if (currentNotifications.length < 1) return false;

          const history = await loadHistoryPage({ requestWallet });
          if (!history || !sameWallet(activeWalletRef.current, requestWallet)) {
            return false;
          }

          applyLatestHistory(history, requestWallet);
          setErrorMessage('');

          const key = notificationSetKey(currentNotifications);
          if (autoOpen && shownKeyRef.current !== key) {
            shownKeyRef.current = key;
            openSnapshotRef.current = newestHistoryId(history.items);
            setOpen(true);
          }
          return true;
        } catch (error) {
          console.warn(
            'VeInvite notification lifecycle refresh failed:',
            error,
          );
          return false;
        }
      })();

      lifecycleRefreshRef.current = task;
      try {
        return await task;
      } finally {
        releaseLifecycleRequestLease(lifecycleLease);
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

  const synchronizeNotifications = useCallback(
    async (autoOpen: boolean): Promise<void> => {
      if (!wallet) return;
      const requestWallet = wallet;
      const lifecycleApplied = await refreshLifecycle(autoOpen);
      if (!sameWallet(activeWalletRef.current, requestWallet)) return;

      // When no new lifecycle item was materialized (or lifecycle work was
      // temporarily unavailable), one authoritative history read is enough.
      if (!lifecycleApplied) {
        await loadLatestHistory({ requestWallet });
      }
    },
    [loadLatestHistory, refreshLifecycle, wallet],
  );

  const acknowledge = useCallback(
    async (
      payload: { ids: string[] } | { throughId: string },
    ): Promise<AcknowledgementResult | null> => {
      if (!wallet) return null;
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
        if (!sameWallet(activeWalletRef.current, requestWallet)) {
          return null;
        }
        backOffLifecycleAfterUnauthorized();
        invalidateWalletSession(requestWallet);
        return null;
      }

      const body = (await response.json()) as AcknowledgementResponse;
      if (!response.ok) {
        throw new Error(
          body.error || 'Notification acknowledgement failed.',
        );
      }

      if (!sameWallet(activeWalletRef.current, requestWallet)) {
        return null;
      }

      if (
        typeof body.unreadCount !== 'number' ||
        !Number.isFinite(body.unreadCount) ||
        body.unreadCount < 0
      ) {
        throw new Error('Notification unread count is invalid.');
      }

      return {
        unreadCount: Math.max(0, Math.floor(body.unreadCount)),
      };
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
        const acknowledgement = await acknowledge({ ids: [id] });
        if (!acknowledgement) return;

        const now = new Date().toISOString();
        const nextUnreadCount = acknowledgement.unreadCount;
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
          window.dispatchEvent(
            new Event(HOME_DATA_REFRESH_REQUESTED_EVENT),
          );
        }

        if (wallet) {
          void synchronizeNotifications(false);
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
      nextCursor,
      synchronizeNotifications,
      wallet,
    ],
  );

  const markAllRead = useCallback(async () => {
    if (busy || unreadCount < 1) return;
    const throughId = openSnapshotRef.current;
    if (!throughId) return;

    const unreadThroughSnapshot = items.filter((notification) =>
      notification.readAt === null &&
      notification.kind !== 'REWARD_PAID' &&
      historyIdAtOrBefore(notification.id, throughId),
    );
    const refreshHomeAfterAcknowledgement =
      unreadThroughSnapshot.some(notificationRequiresHomeRefresh);

    setBusy(true);
    setErrorMessage('');

    try {
      const acknowledgement = await acknowledge({ throughId });
      if (!acknowledgement) return;

      const now = new Date().toISOString();
      const nextUnreadCount = acknowledgement.unreadCount;
      setItems((current) => {
        const updated = current.map((item) =>
          item.readAt === null &&
          item.kind !== 'REWARD_PAID' &&
          historyIdAtOrBefore(item.id, throughId)
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
        window.dispatchEvent(
          new Event(HOME_DATA_REFRESH_REQUESTED_EVENT),
        );
      }

      if (wallet) {
        void synchronizeNotifications(false);
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
    nextCursor,
    synchronizeNotifications,
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
      if (!page || !sameWallet(activeWalletRef.current, requestWallet)) return;

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
      if (sameWallet(activeWalletRef.current, requestWallet)) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Notification history request failed.',
        );
      }
    } finally {
      if (sameWallet(activeWalletRef.current, requestWallet)) {
        setLoading(false);
      }
    }
  }, [busy, loadHistoryPage, loading, nextCursor, wallet]);

  useEffect(() => {
    if (!wallet) return;

    let active = true;
    const requestWallet = wallet;
    void synchronizeNotifications(true).finally(() => {
      if (
        active &&
        sameWallet(activeWalletRef.current, requestWallet)
      ) {
        setPresentationReady(true);
      }
    });

    const refreshVisibleNotifications = () => {
      if (document.visibilityState !== 'visible') return;
      void synchronizeNotifications(true);
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
      active = false;
      window.clearInterval(timer);
      document.removeEventListener(
        'visibilitychange',
        refreshVisibleNotifications,
      );
    };
  }, [synchronizeNotifications, wallet]);

  useEffect(() => {
    const onRewardReceiptAcknowledged = () => {
      if (!wallet) return;
      void synchronizeNotifications(false);
    };
    const onRewardReservationReady = () => {
      void synchronizeNotifications(true);
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
  }, [synchronizeNotifications, wallet]);

  if (!wallet) return null;

  return (
    <InviteNotificationHistoryCenter
      locale={locale}
      items={items}
      unreadCount={presentationReady ? unreadCount : 0}
      presentationReady={presentationReady}
      markAllAvailable={items.some(
        (item) => item.readAt === null && item.kind !== 'REWARD_PAID',
      )}
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
          const visibleLoading = !historyResolvedRef.current;
          void loadLatestHistory({
            requestWallet: wallet,
            visibleLoading,
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