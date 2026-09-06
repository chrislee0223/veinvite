'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  InviteNotificationHistoryCenter,
} from '@/components/InviteNotificationHistoryCenter';
import {
  InviteNotificationSurfaceV2,
} from '@/components/InviteNotificationSurfaceV2';
import type { SupportedLocale } from '@/lib/i18n/locales';
import type {
  InviteNotificationHistoryItem,
} from '@/lib/notifications/inviteNotificationHistory';
import type {
  InviteNotificationPayloadV2,
  InviteNotificationKindV2,
} from '@/lib/notifications/inviteNotificationStateV2';

export type QaNotificationStateId =
  | 'NOTI-BELL-EMPTY'
  | 'NOTI-BELL-UNREAD'
  | 'NOTI-HISTORY-OPEN'
  | 'NOTI-HISTORY-LOADING'
  | 'NOTI-HISTORY-ERROR'
  | 'NOTI-HISTORY-READ'
  | 'NOTI-HISTORY-UNREAD'
  | 'NOTI-HISTORY-MORE'
  | 'NOTI-INVITE-ACCEPTED'
  | 'NOTI-DAPP-1'
  | 'NOTI-DAPP-2'
  | 'NOTI-DAPP-3'
  | 'NOTI-VOT3'
  | 'NOTI-COLLAPSED-PROGRESS'
  | 'NOTI-REWARD-READY'
  | 'NOTI-REWARD-PAID'
  | 'NOTI-INELIGIBLE'
  | 'NOTI-ACK-BUSY'
  | 'NOTI-ACK-ERROR';

type HistoryFixture = {
  mode: 'history';
  items: InviteNotificationHistoryItem[];
  unreadCount: number;
  open: boolean;
  loading?: boolean;
  errorMessage?: string;
  hasMore?: boolean;
};

type SurfaceFixture = {
  mode: 'surface';
  notifications: InviteNotificationPayloadV2[];
  busy?: boolean;
  errorMessage?: string;
};

type NotificationFixture = HistoryFixture | SurfaceFixture;

const QA_FRIEND =
  '0x0000000000000000000000000000000000000b01';
const QA_REWARD_WEI = '262970000000000000000';

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function historyItem({
  id,
  kind,
  minutes,
  read = false,
  dappProgress = null,
  collapsedProgress = false,
  rewardAmountWei = null,
}: {
  id: string;
  kind: InviteNotificationKindV2;
  minutes: number;
  read?: boolean;
  dappProgress?: number | null;
  collapsedProgress?: boolean;
  rewardAmountWei?: string | null;
}): InviteNotificationHistoryItem {
  return {
    id,
    inviteCode: `QA-NOTI-${id.padStart(2, '0')}`,
    kind,
    stage: Number(id),
    eventAt: minutesAgo(minutes),
    rewardAmountWei,
    dappProgress,
    collapsedProgress,
    friendWallet: QA_FRIEND,
    readAt: read ? minutesAgo(Math.max(0, minutes - 1)) : null,
  };
}

function surfaceItem({
  kind,
  dappProgress = null,
  collapsedProgress = false,
  rewardAmountWei = null,
}: {
  kind: InviteNotificationKindV2;
  dappProgress?: number | null;
  collapsedProgress?: boolean;
  rewardAmountWei?: string | null;
}): InviteNotificationPayloadV2 {
  return {
    inviteCode: 'QA-NOTI-SURFACE',
    kind,
    stage: 3,
    eventAt: minutesAgo(2),
    rewardAmountWei,
    dappProgress,
    collapsedProgress,
  };
}

function mixedHistory(): InviteNotificationHistoryItem[] {
  return [
    historyItem({
      id: '6',
      kind: 'REWARD_READY',
      minutes: 3,
      rewardAmountWei: QA_REWARD_WEI,
    }),
    historyItem({
      id: '5',
      kind: 'VOT3_CONVERTED',
      minutes: 18,
      read: true,
      dappProgress: 3,
    }),
    historyItem({
      id: '4',
      kind: 'DAPP_PROGRESS',
      minutes: 42,
      dappProgress: 3,
    }),
    historyItem({
      id: '3',
      kind: 'INVITE_ACCEPTED',
      minutes: 70,
      read: true,
    }),
  ];
}

function fixtureForState(
  stateId: QaNotificationStateId,
): NotificationFixture {
  switch (stateId) {
    case 'NOTI-BELL-EMPTY':
      return {
        mode: 'history',
        items: [],
        unreadCount: 0,
        open: false,
      };
    case 'NOTI-BELL-UNREAD':
      return {
        mode: 'history',
        items: mixedHistory(),
        unreadCount: 2,
        open: false,
      };
    case 'NOTI-HISTORY-OPEN':
      return {
        mode: 'history',
        items: mixedHistory(),
        unreadCount: 2,
        open: true,
      };
    case 'NOTI-HISTORY-LOADING':
      return {
        mode: 'history',
        items: [],
        unreadCount: 0,
        open: true,
        loading: true,
      };
    case 'NOTI-HISTORY-ERROR':
      return {
        mode: 'history',
        items: [],
        unreadCount: 0,
        open: true,
        errorMessage: 'QA notification history request failed.',
      };
    case 'NOTI-HISTORY-READ':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '9',
            kind: 'REWARD_PAID',
            minutes: 8,
            read: true,
            rewardAmountWei: QA_REWARD_WEI,
          }),
        ],
        unreadCount: 0,
        open: true,
      };
    case 'NOTI-HISTORY-UNREAD':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '10',
            kind: 'DAPP_PROGRESS',
            minutes: 6,
            dappProgress: 2,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-HISTORY-MORE':
      return {
        mode: 'history',
        items: mixedHistory(),
        unreadCount: 2,
        open: true,
        hasMore: true,
      };
    case 'NOTI-INVITE-ACCEPTED':
      return {
        mode: 'surface',
        notifications: [surfaceItem({ kind: 'INVITE_ACCEPTED' })],
      };
    case 'NOTI-DAPP-1':
      return {
        mode: 'surface',
        notifications: [
          surfaceItem({ kind: 'DAPP_PROGRESS', dappProgress: 1 }),
        ],
      };
    case 'NOTI-DAPP-2':
      return {
        mode: 'surface',
        notifications: [
          surfaceItem({ kind: 'DAPP_PROGRESS', dappProgress: 2 }),
        ],
      };
    case 'NOTI-DAPP-3':
      return {
        mode: 'surface',
        notifications: [
          surfaceItem({ kind: 'DAPP_PROGRESS', dappProgress: 3 }),
        ],
      };
    case 'NOTI-VOT3':
      return {
        mode: 'surface',
        notifications: [
          surfaceItem({
            kind: 'VOT3_CONVERTED',
            dappProgress: 3,
          }),
        ],
      };
    case 'NOTI-COLLAPSED-PROGRESS':
      return {
        mode: 'surface',
        notifications: [
          surfaceItem({
            kind: 'VOT3_CONVERTED',
            dappProgress: 3,
            collapsedProgress: true,
          }),
        ],
      };
    case 'NOTI-REWARD-READY':
      return {
        mode: 'surface',
        notifications: [
          surfaceItem({
            kind: 'REWARD_READY',
            dappProgress: 3,
            rewardAmountWei: QA_REWARD_WEI,
          }),
        ],
      };
    case 'NOTI-REWARD-PAID':
      return {
        mode: 'surface',
        notifications: [
          surfaceItem({
            kind: 'REWARD_PAID',
            dappProgress: 3,
            rewardAmountWei: QA_REWARD_WEI,
          }),
        ],
      };
    case 'NOTI-INELIGIBLE':
      return {
        mode: 'surface',
        notifications: [surfaceItem({ kind: 'INVITE_INELIGIBLE' })],
      };
    case 'NOTI-ACK-BUSY':
      return {
        mode: 'surface',
        notifications: [surfaceItem({ kind: 'INVITE_ACCEPTED' })],
        busy: true,
      };
    case 'NOTI-ACK-ERROR':
      return {
        mode: 'surface',
        notifications: [surfaceItem({ kind: 'INVITE_ACCEPTED' })],
        errorMessage: 'QA notification acknowledgement failed.',
      };
  }
}

function QaNotificationStage({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '24px',
        background:
          'radial-gradient(circle at 82% 8%, rgba(244,183,40,0.10), transparent 26%), #080807',
        color: '#fff',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'flex-start',
        }}
      >
        {children}
      </div>
    </main>
  );
}

export function QaNotificationStateHarness({
  stateId,
  locale,
}: {
  stateId: QaNotificationStateId;
  locale: SupportedLocale;
}) {
  const seed = useMemo(
    () => fixtureForState(stateId),
    [stateId],
  );
  const [open, setOpen] = useState(
    seed.mode === 'history' ? seed.open : true,
  );
  const [items, setItems] = useState<InviteNotificationHistoryItem[]>(
    seed.mode === 'history' ? seed.items : [],
  );
  const [unreadCount, setUnreadCount] = useState(
    seed.mode === 'history' ? seed.unreadCount : 0,
  );
  const [loading, setLoading] = useState(
    seed.mode === 'history' ? Boolean(seed.loading) : false,
  );
  const [errorMessage, setErrorMessage] = useState(
    seed.errorMessage ?? '',
  );
  const [hasMore, setHasMore] = useState(
    seed.mode === 'history' ? Boolean(seed.hasMore) : false,
  );

  useEffect(() => {
    setOpen(seed.mode === 'history' ? seed.open : true);
    setItems(seed.mode === 'history' ? seed.items : []);
    setUnreadCount(seed.mode === 'history' ? seed.unreadCount : 0);
    setLoading(seed.mode === 'history' ? Boolean(seed.loading) : false);
    setErrorMessage(seed.errorMessage ?? '');
    setHasMore(seed.mode === 'history' ? Boolean(seed.hasMore) : false);
  }, [seed]);

  if (seed.mode === 'surface') {
    return (
      <QaNotificationStage>
        <InviteNotificationSurfaceV2
          locale={locale}
          notifications={seed.notifications}
          open={open}
          busy={Boolean(seed.busy)}
          errorMessage={errorMessage}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
        />
      </QaNotificationStage>
    );
  }

  return (
    <QaNotificationStage>
      <InviteNotificationHistoryCenter
        locale={locale}
        items={items}
        unreadCount={unreadCount}
        open={open}
        loading={loading}
        busy={false}
        errorMessage={errorMessage}
        hasMore={hasMore}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        onRetry={() => {
          setLoading(false);
          setErrorMessage('');
        }}
        onMarkRead={(id) => {
          setItems((current) =>
            current.map((item) =>
              item.id === id && item.readAt === null
                ? { ...item, readAt: new Date().toISOString() }
                : item,
            ),
          );
          setUnreadCount((current) => Math.max(0, current - 1));
        }}
        onMarkAll={() => {
          const now = new Date().toISOString();
          setItems((current) =>
            current.map((item) => ({
              ...item,
              readAt: item.readAt ?? now,
            })),
          );
          setUnreadCount(0);
        }}
        onLoadMore={() => {
          setItems((current) => [
            ...current,
            historyItem({
              id: '2',
              kind: 'INVITE_ACCEPTED',
              minutes: 180,
              read: true,
            }),
          ]);
          setHasMore(false);
        }}
      />
    </QaNotificationStage>
  );
}
