'use client';

import {
  useEffect,
  useRef,
} from 'react';

import { INELIGIBLE_INVITER_COPY } from '@/lib/i18n/ineligibleInviterCopy';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import {
  isRtlLocale,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';

export type InviteNotificationKind =
  | 'INVITE_ACCEPTED'
  | 'DAPP_MISSION_COMPLETED'
  | 'VOT3_CONVERTED'
  | 'ALL_MISSIONS_COMPLETED'
  | 'REWARD_PAID'
  | 'INVITE_INELIGIBLE';

export type InviteNotificationPayload = {
  inviteCode: string;
  kind: InviteNotificationKind;
  stage: number;
  eventAt: string;
  rewardAmountWei: string | null;
  acknowledgedStage: number;
  collapsedProgress: boolean;
};

const B3TR_SCALE = 10n ** 18n;

function formatB3trWei(value: string): string {
  try {
    const amount = BigInt(value);
    const whole = amount / B3TR_SCALE;
    const fraction = (amount % B3TR_SCALE)
      .toString()
      .padStart(18, '0')
      .slice(0, 4)
      .replace(/0+$/u, '');

    return `${whole.toString()}${
      fraction ? `.${fraction}` : ''
    }`;
  } catch {
    return value;
  }
}

function notificationText(
  notification: InviteNotificationPayload,
  copy: (typeof NOTIFICATION_COPY)[Locale],
  ineligibleCopy: {
    title: string;
    body: string;
  },
) {
  switch (notification.kind) {
    case 'INVITE_ACCEPTED':
      return {
        title: copy.acceptedTitle,
        body: copy.acceptedBody,
        hint: null,
      };
    case 'DAPP_MISSION_COMPLETED':
      return {
        title: copy.dappTitle,
        body: copy.dappBody,
        hint: null,
      };
    case 'VOT3_CONVERTED':
      return notification.collapsedProgress
        ? {
            title: copy.progressTitle,
            body: copy.progressVot3Body,
            hint: copy.vot3Hint,
          }
        : {
            title: copy.vot3Title,
            body: copy.vot3Body,
            hint: copy.vot3Hint,
          };
    case 'ALL_MISSIONS_COMPLETED':
      return {
        title: copy.allMissionsTitle,
        body: copy.allMissionsBody,
        hint: copy.allMissionsHint,
      };
    case 'REWARD_PAID':
      return {
        title: copy.rewardTitle,
        body: copy.rewardBody,
        hint: null,
      };
    case 'INVITE_INELIGIBLE':
      return {
        title: ineligibleCopy.title,
        body: ineligibleCopy.body,
        hint: null,
      };
  }
}

export function InviteNotificationSurface({
  locale,
  notification,
  unreadCount,
  open,
  busy = false,
  errorMessage = '',
  onOpen,
  onClose,
}: {
  locale: Locale;
  notification: InviteNotificationPayload | null;
  unreadCount: number;
  open: boolean;
  busy?: boolean;
  errorMessage?: string;
  onOpen: () => void;
  onClose: () => void | Promise<void>;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const copy = NOTIFICATION_COPY[locale];
  const supportedLocale = locale as SupportedLocale;
  const ineligibleCopy =
    INELIGIBLE_INVITER_COPY[supportedLocale] ??
    INELIGIBLE_INVITER_COPY.en;
  const rtl = isRtlLocale(supportedLocale);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.requestAnimationFrame(() => {
      confirmRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () =>
      document.removeEventListener(
        'keydown',
        onKeyDown,
      );
  }, [open, onClose]);

  const text = notification
    ? notificationText(
        notification,
        copy,
        ineligibleCopy,
      )
    : null;
  const isReward =
    notification?.kind === 'REWARD_PAID';

  return (
    <div className="notificationRoot">
      <button
        type="button"
        className={
          unreadCount > 0
            ? 'bellButton unread'
            : 'bellButton'
        }
        aria-label={copy.bellAria}
        onClick={() => {
          if (notification) {
            onOpen();
          }
        }}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="unreadDot" />
        ) : null}
      </button>

      {open && notification && text ? (
        <div
          className={
            isReward
              ? 'notificationBackdrop rewardMode'
              : 'notificationBackdrop'
          }
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              void onClose();
            }
          }}
        >
          <section
            className={
              isReward
                ? 'notificationCard rewardCard'
                : 'notificationCard'
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-notification-title"
            aria-describedby="invite-notification-body"
            lang={supportedLocale}
            dir={rtl ? 'rtl' : 'ltr'}
          >
            <button
              type="button"
              className="closeButton"
              aria-label={copy.closeAria}
              disabled={busy}
              onClick={() => void onClose()}
            >
              ×
            </button>

            <div
              className={`stageIcon stage${notification.stage}`}
              aria-hidden="true"
            >
              <StageIcon
                kind={notification.kind}
              />
            </div>

            <div className="notificationCopy">
              <h2 id="invite-notification-title">
                {text.title}
              </h2>

              {isReward &&
              notification.rewardAmountWei ? (
                <strong className="rewardAmount">
                  +{formatB3trWei(
                    notification.rewardAmountWei,
                  )}{' '}
                  B3TR
                </strong>
              ) : null}

              <p id="invite-notification-body">
                {text.body}
              </p>
              {text.hint ? (
                <p className="notificationHint">
                  {text.hint}
                </p>
              ) : null}
            </div>

            {errorMessage ? (
              <p className="notificationError" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <button
              ref={confirmRef}
              type="button"
              className="confirmButton"
              disabled={busy}
              onClick={() => void onClose()}
            >
              {copy.confirm}
            </button>
          </section>
        </div>
      ) : null}

      <style jsx>{`
        .notificationRoot { display:flex; align-items:center; }
        .bellButton { position:relative; width:40px; height:40px; flex:0 0 40px; display:grid; place-items:center; padding:0; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#b6b2bf; cursor:pointer; transition:border-color .18s ease,color .18s ease,box-shadow .18s ease; }
        .bellButton.unread { border-color:rgba(255,205,80,.36); color:#ffd04a; box-shadow:0 0 0 3px rgba(244,183,40,.05); }
        .unreadDot { position:absolute; top:-3px; right:-3px; width:10px; height:10px; border:2px solid #080807; border-radius:50%; background:#f4b728; box-shadow:0 0 12px rgba(244,183,40,.7); }
        .notificationBackdrop { position:fixed; z-index:140; inset:0; display:flex; align-items:flex-end; justify-content:center; padding:20px; background:rgba(2,2,2,.72); backdrop-filter:blur(9px); }
        .notificationBackdrop.rewardMode { align-items:center; }
        .notificationCard { position:relative; width:min(100%,520px); box-sizing:border-box; padding:28px 24px 24px; display:grid; justify-items:center; gap:17px; border:1px solid rgba(255,205,80,.24); border-radius:28px; background:linear-gradient(155deg,#211b10,#11110f 66%); color:#fff; text-align:center; box-shadow:0 32px 90px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.07); }
        .rewardCard { width:min(100%,410px); border-color:rgba(255,205,80,.4); background:radial-gradient(circle at 50% 16%,rgba(244,183,40,.18),transparent 36%),linear-gradient(155deg,#211a0c,#10100e 70%); box-shadow:0 32px 100px rgba(0,0,0,.64),0 0 45px rgba(244,183,40,.08),inset 0 1px 0 rgba(255,255,255,.08); }
        .closeButton { position:absolute; top:13px; inset-inline-end:15px; width:34px; height:34px; display:grid; place-items:center; padding:0; border:0; background:transparent; color:#77736f; font:inherit; font-size:1.65rem; line-height:1; cursor:pointer; }
        .closeButton:disabled,.confirmButton:disabled { opacity:.5; cursor:not-allowed; }
        .stageIcon { width:62px; height:62px; display:grid; place-items:center; border-radius:20px; }
        .stage1 { background:rgba(163,113,255,.15); color:#b58aff; }
        .stage2 { background:rgba(81,150,255,.15); color:#72adff; }
        .stage3 { background:rgba(62,215,142,.14); color:#75efb8; }
        .stage4 { background:rgba(244,183,40,.15); color:#ffd04a; }
        .stage5 { background:rgba(244,183,40,.18); color:#ffd04a; box-shadow:0 0 30px rgba(244,183,40,.11); }
        .stage6 { background:rgba(244,183,40,.15); color:#ffd04a; }
        .notificationCopy { min-width:0; width:100%; }
        .notificationCopy h2 { margin:0; color:#fff; font-size:1.25rem; line-height:1.25; letter-spacing:-.025em; overflow-wrap:anywhere; }
        .notificationCopy p { margin:9px auto 0; max-width:390px; color:#b5b0ba; font-size:.88rem; font-weight:650; line-height:1.55; overflow-wrap:anywhere; }
        .notificationCopy .notificationHint { margin-top:4px; color:#8e8992; font-size:.8rem; }
        .rewardAmount { display:block; margin-top:12px; color:#ffd04a; font-size:clamp(1.75rem,8vw,2.35rem); line-height:1.05; letter-spacing:-.03em; overflow-wrap:anywhere; }
        .notificationError { margin:0; color:#ff7c8d; font-size:.75rem; line-height:1.4; }
        .confirmButton { width:100%; min-height:52px; border:0; border-radius:16px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font:inherit; font-size:.9rem; font-weight:950; cursor:pointer; box-shadow:0 14px 32px rgba(190,126,12,.2),inset 0 1px 0 rgba(255,255,255,.22); }
        @media (max-width:560px) {
          .bellButton { width:34px; height:34px; flex-basis:34px; border-radius:11px; }
          .notificationBackdrop { padding:12px 12px 88px; }
          .notificationBackdrop:not(.rewardMode) { padding:0; }
          .notificationBackdrop:not(.rewardMode) .notificationCard { width:100%; max-width:none; padding:27px 20px max(24px,env(safe-area-inset-bottom)); border-right:0; border-bottom:0; border-left:0; border-radius:27px 27px 0 0; }
          .rewardCard { padding:27px 20px 22px; border-radius:25px; }
          .stageIcon { width:56px; height:56px; border-radius:18px; }
          .notificationCopy h2 { font-size:1.15rem; }
        }
      `}</style>
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M18 8.5a6 6 0 0 0-12 0c0 7-2.5 7-2.5 8.5h17C20.5 15.5 18 15.5 18 8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 20a3 3 0 0 0 5 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StageIcon({
  kind,
}: {
  kind: InviteNotificationKind;
}) {
  if (kind === 'INVITE_INELIGIBLE') {
    return (
      <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path d="M9 11h15m0 0-4-4m4 4-4 4M27 25H12m0 0 4 4m-4-4 4-4" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === 'DAPP_MISSION_COMPLETED') {
    return (
      <svg width="31" height="31" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
        <rect x="4" y="4" width="10" height="10" rx="3" />
        <rect x="18" y="4" width="10" height="10" rx="3" />
        <rect x="4" y="18" width="10" height="10" rx="3" />
        <rect x="18" y="18" width="10" height="10" rx="3" />
      </svg>
    );
  }

  if (kind === 'VOT3_CONVERTED') {
    return (
      <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path d="M8 12h18m0 0-5-5m5 5-5 5M28 24H10m0 0 5 5m-5-5 5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === 'ALL_MISSIONS_COMPLETED') {
    return (
      <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <circle cx="18" cy="18" r="12.5" stroke="currentColor" strokeWidth="2.7" />
        <path d="m11.5 18 4.2 4.2L25 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === 'REWARD_PAID') {
    return (
      <svg width="35" height="35" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path d="M18 4.5 22 12l7.5 4-7.5 4-4 7.5L14 20l-7.5-4 7.5-4 4-7.5Z" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
        <circle cx="18" cy="16" r="2.7" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="15" cy="12" r="5" stroke="currentColor" strokeWidth="2.6" />
      <path d="M6.5 28c.9-5.5 4.1-8.2 8.5-8.2 3.2 0 5.8 1.4 7.2 4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="26" cy="24.5" r="6.5" fill="currentColor" opacity=".2" />
      <path d="m23 24.5 2 2 4-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
