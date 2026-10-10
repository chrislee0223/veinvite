'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  InviteNotificationHistoryCenter,
} from '@/components/InviteNotificationHistoryCenter';
import { TransientSnackbar } from '@/components/TransientSnackbar';
import type { SupportedLocale } from '@/lib/i18n/locales';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import { REWARD_RECEIPT_COPY } from '@/lib/i18n/rewardReceiptCopy';
import type {
  InviteNotificationHistoryItem,
} from '@/lib/notifications/inviteNotificationHistory';
import type {
  InviteNotificationKindV2,
} from '@/lib/notifications/inviteNotificationStateV2';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';
import {
  rewardReceiptShareLabel,
  rewardReceiptXIntentUrl,
} from '@/lib/rewards/rewardReceiptShare';

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
  | 'NOTI-REWARD-PAID-POPUP'
  | 'NOTI-REWARD-ADJUSTED'
  | 'NOTI-INELIGIBLE'
  | 'NOTI-SECURITY-REVIEW'
  | 'NOTI-SECURITY-CLEARED'
  | 'NOTI-POST-PAYOUT-REVIEW'
  | 'NOTI-POST-PAYOUT-CLEARED'
  | 'NOTI-SECURITY-RESTRICTED'
  | 'NOTI-REFERRAL-INVALIDATED'
  | 'NOTI-REFERRAL-RESTORED'
  | 'NOTI-INVITER-WATCH'
  | 'NOTI-INVITER-HOLD'
  | 'NOTI-INVITER-RESTRICTED'
  | 'NOTI-INVITER-RESTORED';

type HistoryFixture = {
  mode: 'history';
  items: InviteNotificationHistoryItem[];
  unreadCount: number;
  open: boolean;
  loading?: boolean;
  errorMessage?: string;
  hasMore?: boolean;
  previewRewardReceipt?: RewardReceipt;
  rewardShareUrl?: string;
  onRewardShare?: (intentUrl: string) => void;
};

type NotificationFixture = HistoryFixture;

const QA_FRIEND =
  '0x0000000000000000000000000000000000000b01';
const QA_REWARD_WEI = '262970000000000000000';
const QA_REWARD_INVITE_CODE = 'QA-NOTI-22';
const QA_REWARD_RECEIPT: RewardReceipt = {
  id: 'qa-receipt-1',
  receiptVersion: 'v1',
  payoutId: 'qa-payout-1',
  rewardRoundId: '117',
  settlementId: 'qa-settlement-1',
  network: 'mainnet',
  veBetterRoundId: '117',
  inviteCode: QA_REWARD_INVITE_CODE,
  recipientWallet: QA_FRIEND,
  amountWei: QA_REWARD_WEI,
  amountB3tr: '262.97',
  txId: `0x${'a'.repeat(64)}`,
  paidAt: '2026-10-04T00:00:00.000Z',
  seen: false,
  seenAt: null,
  createdAt: '2026-10-04T00:00:00.000Z',
};

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
        mode: 'history',
        items: [historyItem({ id: '24', kind: 'INVITE_ACCEPTED', minutes: 2 })],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-DAPP-1':
      return {
        mode: 'history',
        items: [historyItem({ id: '25', kind: 'DAPP_PROGRESS', minutes: 2, dappProgress: 1 })],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-DAPP-2':
      return {
        mode: 'history',
        items: [historyItem({ id: '26', kind: 'DAPP_PROGRESS', minutes: 2, dappProgress: 2 })],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-DAPP-3':
      return {
        mode: 'history',
        items: [historyItem({ id: '27', kind: 'DAPP_PROGRESS', minutes: 2, dappProgress: 3 })],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-VOT3':
      return {
        mode: 'history',
        items: [historyItem({ id: '28', kind: 'VOT3_CONVERTED', minutes: 2, dappProgress: 3 })],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-COLLAPSED-PROGRESS':
      return {
        mode: 'history',
        items: [historyItem({ id: '29', kind: 'VOT3_CONVERTED', minutes: 2, dappProgress: 3, collapsedProgress: true })],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-REWARD-READY':
      return {
        mode: 'history',
        items: [historyItem({ id: '30', kind: 'REWARD_READY', minutes: 2, dappProgress: 3, rewardAmountWei: QA_REWARD_WEI })],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-REWARD-PAID':
      return {
        mode: 'history',
        items: [
          {
            ...historyItem({
              id: '22',
              kind: 'REWARD_PAID',
              minutes: 2,
              rewardAmountWei: QA_REWARD_WEI,
            }),
            inviteCode: QA_REWARD_INVITE_CODE,
          },
        ],
        unreadCount: 1,
        open: true,
        previewRewardReceipt: QA_REWARD_RECEIPT,
        rewardShareUrl:
          'https://veinvite.vercel.app/s/qa-reward-share-preview',
      };
    case 'NOTI-REWARD-PAID-POPUP':
      return {
        mode: 'history',
        items: [],
        unreadCount: 0,
        open: false,
      };
    case 'NOTI-REWARD-ADJUSTED':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '23',
            kind: 'REWARD_ADJUSTED',
            minutes: 2,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-INELIGIBLE':
      return {
        mode: 'history',
        items: [historyItem({ id: '31', kind: 'INVITE_INELIGIBLE', minutes: 2 })],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-SECURITY-REVIEW':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '11',
            kind: 'SECURITY_REVIEW_STARTED',
            minutes: 4,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-SECURITY-CLEARED':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '21',
            kind: 'SECURITY_REVIEW_CLEARED',
            minutes: 5,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-POST-PAYOUT-REVIEW':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '17',
            kind: 'SECURITY_POST_PAYOUT_REVIEW_STARTED',
            minutes: 5,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-POST-PAYOUT-CLEARED':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '18',
            kind: 'SECURITY_POST_PAYOUT_REVIEW_CLEARED',
            minutes: 6,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-SECURITY-RESTRICTED':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '12',
            kind: 'SECURITY_RESTRICTION_CONFIRMED',
            minutes: 7,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-REFERRAL-INVALIDATED':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '19',
            kind: 'SECURITY_REFERRAL_INVALIDATED',
            minutes: 8,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-REFERRAL-RESTORED':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '20',
            kind: 'SECURITY_REFERRAL_RESTORED',
            minutes: 9,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-INVITER-WATCH':
      return {
        mode: 'history',
        items: [],
        unreadCount: 0,
        open: true,
      };
    case 'NOTI-INVITER-HOLD':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '14',
            kind: 'SECURITY_INVITER_HOLD',
            minutes: 5,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-INVITER-RESTRICTED':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '15',
            kind: 'SECURITY_INVITER_RESTRICTED',
            minutes: 5,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
    case 'NOTI-INVITER-RESTORED':
      return {
        mode: 'history',
        items: [
          historyItem({
            id: '16',
            kind: 'SECURITY_INVITER_ACCESS_RESTORED',
            minutes: 5,
          }),
        ],
        unreadCount: 1,
        open: true,
      };
  }
}

function QaNotificationStage({
  children,
  embedded = false,
}: {
  children: React.ReactNode;
  embedded?: boolean;
}) {
  if (embedded) return <>{children}</>;

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
  embedded = false,
}: {
  stateId: QaNotificationStateId;
  locale: SupportedLocale;
  embedded?: boolean;
}) {
  const seed = useMemo(
    () => fixtureForState(stateId),
    [stateId],
  );
  const [open, setOpen] = useState(
    seed.open,
  );
  const [items, setItems] = useState<InviteNotificationHistoryItem[]>(
    seed.items,
  );
  const [unreadCount, setUnreadCount] = useState(
    seed.unreadCount,
  );
  const [loading, setLoading] = useState(
    Boolean(seed.loading),
  );
  const [errorMessage, setErrorMessage] = useState(
    seed.errorMessage ?? '',
  );
  const [hasMore, setHasMore] = useState(
    Boolean(seed.hasMore),
  );

  useEffect(() => {
    setOpen(seed.open);
    setItems(seed.items);
    setUnreadCount(seed.unreadCount);
    setLoading(Boolean(seed.loading));
    setErrorMessage(seed.errorMessage ?? '');
    setHasMore(Boolean(seed.hasMore));
  }, [seed]);

  if (stateId === 'NOTI-REWARD-PAID-POPUP') {
    return (
      <QaNotificationStage embedded={embedded}>
        <TransientSnackbar
          locale={locale}
          feedback={{
            id: 1,
            kind: 'reward',
            title: NOTIFICATION_COPY[locale].rewardTitle,
            text: REWARD_RECEIPT_COPY[locale].description,
            amountB3tr: '262.97',
            shareLabel: rewardReceiptShareLabel(locale),
            confirmLabel: NOTIFICATION_COPY[locale].confirm,
            onShare: () => {
              const intentUrl = rewardReceiptXIntentUrl({
                locale,
                amountB3tr: '262.97',
                referralUrl:
                  'https://veinvite.vercel.app/s/qa-reward-share-preview',
              });
              window.open(
                intentUrl,
                '_blank',
                'noopener,noreferrer',
              );
            },
            onConfirm: () => {},
          }}
          closeLabel={NOTIFICATION_COPY[locale].closeAria}
          onDismiss={() => {}}
        />
      </QaNotificationStage>
    );
  }

  return (
    <QaNotificationStage embedded={embedded}>
      <InviteNotificationHistoryCenter
        locale={locale}
        items={items}
        unreadCount={unreadCount}
        markAllAvailable={items.some(
          (item) => item.readAt === null && item.kind !== 'REWARD_PAID',
        )}
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
        previewRewardReceipt={seed.previewRewardReceipt ?? null}
        rewardShareUrl={seed.rewardShareUrl ?? ''}
        onRewardShare={seed.onRewardShare}
        allowProgrammaticOpen
      />
    </QaNotificationStage>
  );
}
