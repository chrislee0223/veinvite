'use client';

import { useEffect, useRef } from 'react';

import { INELIGIBLE_INVITER_COPY } from '@/lib/i18n/ineligibleInviterCopy';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import { NOTIFICATION_V2_COPY } from '@/lib/i18n/notificationV2Copy';
import {
  isRtlLocale,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import type {
  InviteNotificationPayloadV2,
} from '@/lib/notifications/inviteNotificationStateV2';

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
    return `${whole.toString()}${fraction ? `.${fraction}` : ''}`;
  } catch {
    return value;
  }
}

function statusText(
  notification: InviteNotificationPayloadV2,
  locale: SupportedLocale,
): {
  title: string;
  body: string;
  hint: string | null;
} {
  const copy = NOTIFICATION_COPY[locale];
  const v2 = NOTIFICATION_V2_COPY[locale];
  const ineligible = INELIGIBLE_INVITER_COPY[locale] ??
    INELIGIBLE_INVITER_COPY.en;

  switch (notification.kind) {
    case 'INVITE_ACCEPTED':
      return {
        title: copy.acceptedTitle,
        body: copy.acceptedBody,
        hint: null,
      };
    case 'DAPP_PROGRESS':
      return {
        title: v2.dappProgressTitle,
        body: v2.dappProgressBody,
        hint: `dApp ${notification.dappProgress ?? 0}/3`,
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
    case 'REWARD_READY':
      return {
        title: v2.rewardReadyTitle,
        body: v2.rewardReadyBody,
        hint: null,
      };
    case 'REWARD_PAID':
      return {
        title: copy.rewardTitle,
        body: copy.rewardBody,
        hint: null,
      };
    case 'INVITE_INELIGIBLE':
      return {
        title: ineligible.title,
        body: ineligible.body,
        hint: null,
      };
  }
}

function shortStatus(
  notification: InviteNotificationPayloadV2,
  locale: SupportedLocale,
): string {
  if (notification.kind === 'DAPP_PROGRESS') {
    return `dApp ${notification.dappProgress ?? 0}/3`;
  }
  if (notification.kind === 'VOT3_CONVERTED') return 'VOT3';
  if (notification.kind === 'REWARD_READY') {
    const amount = notification.rewardAmountWei
      ? ` · ${formatB3trWei(notification.rewardAmountWei)} B3TR`
      : '';
    return `${NOTIFICATION_V2_COPY[locale].rewardReadyTitle}${amount}`;
  }
  if (notification.kind === 'REWARD_PAID') {
    const amount = notification.rewardAmountWei
      ? ` · ${formatB3trWei(notification.rewardAmountWei)} B3TR`
      : '';
    return `${NOTIFICATION_COPY[locale].rewardTitle}${amount}`;
  }
  if (notification.kind === 'INVITE_ACCEPTED') {
    return NOTIFICATION_COPY[locale].acceptedTitle;
  }
  return (INELIGIBLE_INVITER_COPY[locale] ?? INELIGIBLE_INVITER_COPY.en).title;
}

export function InviteNotificationSurfaceV2({
  locale,
  notifications,
  open,
  busy = false,
  errorMessage = '',
  onOpen,
  onClose,
}: {
  locale: Locale;
  notifications: InviteNotificationPayloadV2[];
  open: boolean;
  busy?: boolean;
  errorMessage?: string;
  onOpen: () => void;
  onClose: () => void | Promise<void>;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const supportedLocale = locale as SupportedLocale;
  const copy = NOTIFICATION_COPY[supportedLocale];
  const v2 = NOTIFICATION_V2_COPY[supportedLocale];
  const rtl = isRtlLocale(supportedLocale);
  const primary = notifications[0] ?? null;
  const multiple = notifications.length > 1;

  useEffect(() => {
    if (!open) return;

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
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const primaryText = primary
    ? statusText(primary, supportedLocale)
    : null;
  const important =
    primary?.kind === 'REWARD_READY' ||
    primary?.kind === 'REWARD_PAID';
  const badge = notifications.length > 9
    ? '9+'
    : String(notifications.length);

  return (
    <div className="notificationRoot">
      <button
        type="button"
        className={notifications.length > 0 ? 'bellButton unread' : 'bellButton'}
        aria-label={copy.bellAria}
        onClick={() => {
          if (notifications.length > 0) onOpen();
        }}
      >
        <BellIcon />
        {notifications.length > 0 ? (
          <span className="unreadBadge">{badge}</span>
        ) : null}
      </button>

      {open && primary && primaryText ? (
        <div
          className={important ? 'notificationBackdrop rewardMode' : 'notificationBackdrop'}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) void onClose();
          }}
        >
          <section
            className={important ? 'notificationCard rewardCard' : 'notificationCard'}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-notification-v2-title"
            aria-describedby="invite-notification-v2-body"
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

            <div className="stageIcon" aria-hidden="true">
              {multiple ? '••' : important ? '✓' : '•'}
            </div>

            <div className="notificationCopy">
              <h2 id="invite-notification-v2-title">
                {multiple ? v2.summaryTitle : primaryText.title}
              </h2>

              {!multiple &&
              primary.rewardAmountWei &&
              (primary.kind === 'REWARD_READY' || primary.kind === 'REWARD_PAID') ? (
                <strong className="rewardAmount">
                  +{formatB3trWei(primary.rewardAmountWei)} B3TR
                </strong>
              ) : null}

              <p id="invite-notification-v2-body">
                {multiple ? v2.summaryBody : primaryText.body}
              </p>
              {!multiple && primaryText.hint ? (
                <p className="notificationHint">{primaryText.hint}</p>
              ) : null}
            </div>

            {multiple ? (
              <div className="summaryList">
                {notifications.map((notification) => (
                  <div className="summaryRow" key={notification.inviteCode}>
                    <span>{notification.inviteCode}</span>
                    <strong>{shortStatus(notification, supportedLocale)}</strong>
                  </div>
                ))}
              </div>
            ) : null}

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
        .bellButton { position:relative; width:40px; height:40px; flex:0 0 40px; display:grid; place-items:center; padding:0; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#b6b2bf; cursor:pointer; }
        .bellButton.unread { border-color:rgba(255,205,80,.36); color:#ffd04a; box-shadow:0 0 0 3px rgba(244,183,40,.05); }
        .unreadBadge { position:absolute; top:-7px; inset-inline-end:-7px; min-width:19px; height:19px; box-sizing:border-box; padding:0 5px; display:grid; place-items:center; border:2px solid #080807; border-radius:999px; background:#f4b728; color:#17120a; font-size:.6rem; font-weight:950; line-height:1; }
        .notificationBackdrop { position:fixed; z-index:140; inset:0; display:flex; align-items:flex-end; justify-content:center; padding:20px; background:rgba(2,2,2,.72); backdrop-filter:blur(9px); }
        .notificationBackdrop.rewardMode { align-items:center; }
        .notificationCard { position:relative; width:min(100%,520px); max-height:calc(100dvh - 40px); overflow-y:auto; box-sizing:border-box; padding:28px 24px 24px; display:grid; justify-items:center; gap:17px; border:1px solid rgba(255,205,80,.24); border-radius:28px; background:linear-gradient(155deg,#211b10,#11110f 66%); color:#fff; text-align:center; box-shadow:0 32px 90px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.07); }
        .rewardCard { width:min(100%,430px); border-color:rgba(255,205,80,.4); background:radial-gradient(circle at 50% 16%,rgba(244,183,40,.18),transparent 36%),linear-gradient(155deg,#211a0c,#10100e 70%); }
        .closeButton { position:absolute; top:13px; inset-inline-end:15px; width:34px; height:34px; display:grid; place-items:center; padding:0; border:0; background:transparent; color:#77736f; font:inherit; font-size:1.65rem; cursor:pointer; }
        .stageIcon { width:62px; height:62px; display:grid; place-items:center; border-radius:20px; background:rgba(244,183,40,.15); color:#ffd04a; font-size:1.3rem; font-weight:950; }
        .notificationCopy { min-width:0; width:100%; }
        .notificationCopy h2 { margin:0; font-size:1.25rem; line-height:1.25; letter-spacing:-.025em; overflow-wrap:anywhere; }
        .notificationCopy p { margin:9px auto 0; max-width:400px; color:#b5b0ba; font-size:.88rem; font-weight:650; line-height:1.55; overflow-wrap:anywhere; }
        .notificationCopy .notificationHint { margin-top:5px; color:#ffd04a; font-size:.8rem; font-weight:900; }
        .rewardAmount { display:block; margin-top:12px; color:#ffd04a; font-size:clamp(1.75rem,8vw,2.35rem); line-height:1.05; letter-spacing:-.03em; }
        .summaryList { width:100%; display:grid; gap:8px; }
        .summaryRow { min-width:0; padding:12px 13px; display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid rgba(255,255,255,.075); border-radius:14px; background:rgba(255,255,255,.035); text-align:start; }
        .summaryRow span { color:#8e8992; font-size:.65rem; font-weight:800; direction:ltr; }
        .summaryRow strong { color:#e8e3dd; font-size:.72rem; line-height:1.35; text-align:end; overflow-wrap:anywhere; }
        .notificationError { margin:0; color:#ff7c8d; font-size:.75rem; line-height:1.4; }
        .confirmButton { width:100%; min-height:52px; border:0; border-radius:16px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font:inherit; font-size:.9rem; font-weight:950; cursor:pointer; box-shadow:0 14px 32px rgba(190,126,12,.2),inset 0 1px 0 rgba(255,255,255,.22); }
        .closeButton:disabled,.confirmButton:disabled { opacity:.5; cursor:not-allowed; }
        @media (max-width:560px) {
          .bellButton { width:34px; height:34px; flex-basis:34px; border-radius:11px; }
          .notificationBackdrop { padding:0; }
          .notificationBackdrop.rewardMode { padding:12px 12px 88px; }
          .notificationBackdrop:not(.rewardMode) .notificationCard { width:100%; max-width:none; max-height:82dvh; padding:27px 20px max(24px,env(safe-area-inset-bottom)); border-right:0; border-bottom:0; border-left:0; border-radius:27px 27px 0 0; }
          .rewardCard { padding:27px 20px 22px; border-radius:25px; }
          .stageIcon { width:56px; height:56px; border-radius:18px; }
          .notificationCopy h2 { font-size:1.15rem; }
          .summaryRow { align-items:flex-start; flex-direction:column; gap:5px; }
          .summaryRow strong { text-align:start; }
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
