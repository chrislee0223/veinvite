'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { INELIGIBLE_INVITER_COPY } from '@/lib/i18n/ineligibleInviterCopy';
import { INVITER_HOLD_NOTIFICATION_COPY } from '@/lib/i18n/inviterHoldNotificationCopy';
import { INVITER_SECURITY_NOTIFICATION_COPY } from '@/lib/i18n/inviterSecurityNotificationCopy';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import { NOTIFICATION_V2_COPY } from '@/lib/i18n/notificationV2Copy';
import { REFERRAL_INVALIDATED_COPY } from '@/lib/i18n/referralInvalidatedCopy';
import { REFERRAL_RESTORED_COPY } from '@/lib/i18n/referralRestoredCopy';
import { POST_PAYOUT_SECURITY_NOTIFICATION_COPY } from '@/lib/i18n/postPayoutSecurityNotificationCopy';
import { SECURITY_NOTIFICATION_COPY } from '@/lib/i18n/securityNotificationCopy';
import { SECURITY_REVIEW_CLEARED_COPY } from '@/lib/i18n/securityReviewClearedCopy';
import {
  isRtlLocale,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import type {
  InviteNotificationKindV2,
  InviteNotificationPayloadV2,
} from '@/lib/notifications/inviteNotificationStateV2';

const B3TR_SCALE = 10n ** 18n;

type StageIconTone = 'positive' | 'neutral' | 'review' | 'restricted';

function stageIconTone(kind: InviteNotificationKindV2): StageIconTone {
  switch (kind) {
    case 'REWARD_READY':
    case 'REWARD_PAID':
    case 'SECURITY_REVIEW_CLEARED':
    case 'SECURITY_POST_PAYOUT_REVIEW_CLEARED':
    case 'SECURITY_INVITER_ACCESS_RESTORED':
    case 'SECURITY_REFERRAL_RESTORED':
      return 'positive';
    case 'SECURITY_REVIEW_STARTED':
    case 'SECURITY_POST_PAYOUT_REVIEW_STARTED':
    case 'SECURITY_INVITER_WATCH':
    case 'SECURITY_INVITER_HOLD':
      return 'review';
    case 'SECURITY_RESTRICTION_CONFIRMED':
    case 'SECURITY_INVITER_RESTRICTED':
    case 'SECURITY_REFERRAL_INVALIDATED':
      return 'restricted';
    default:
      return 'neutral';
  }
}

function NotificationStageIcon({
  notification,
  count,
}: {
  notification: InviteNotificationPayloadV2;
  count: number;
}) {
  if (count > 1) {
    return (
      <span className="stageIconGraphic stageIconStack" data-notification-icon="multiple">
        <IconFrame>
          <rect x="5" y="7" width="12" height="12" rx="2" />
          <path d="M9 4h9a2 2 0 0 1 2 2v9" />
        </IconFrame>
        <span className="stageIconCount">{count > 9 ? '9+' : count}</span>
      </span>
    );
  }

  switch (notification.kind) {
    case 'INVITE_ACCEPTED':
      return (
        <span className="stageIconGraphic" data-notification-icon="invite-accepted">
          <UserStatusIcon status="check" />
        </span>
      );
    case 'DAPP_PROGRESS':
      return (
        <span className="stageIconProgress" data-notification-icon="dapp-progress">
          {Math.max(0, Math.min(3, notification.dappProgress ?? 0))}<small>/3</small>
        </span>
      );
    case 'VOT3_CONVERTED':
      return (
        <span className="stageIconGraphic" data-notification-icon="vot3-converted">
          <IconFrame>
            <path d="M4 8h14l-3-3M20 16H6l3 3" />
          </IconFrame>
        </span>
      );
    case 'REWARD_READY':
      return (
        <span className="stageIconGraphic" data-notification-icon="reward-ready">
          <IconFrame>
            <path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7H8.5a2.5 2.5 0 1 1 2.5-2.5ZM12 7h3.5A2.5 2.5 0 1 0 13 4.5Z" />
          </IconFrame>
        </span>
      );
    case 'REWARD_PAID':
      return (
        <span className="stageIconGraphic" data-notification-icon="reward-paid">
          <IconFrame>
            <circle cx="12" cy="12" r="8.5" />
            <path d="m8.5 12 2.3 2.3 4.9-5" />
          </IconFrame>
        </span>
      );
    case 'INVITE_INELIGIBLE':
      return (
        <span className="stageIconGraphic" data-notification-icon="invite-another-person">
          <UserStatusIcon status="plus" />
        </span>
      );
    case 'SECURITY_REVIEW_STARTED':
    case 'SECURITY_POST_PAYOUT_REVIEW_STARTED':
    case 'SECURITY_INVITER_HOLD':
      return (
        <span className="stageIconGraphic" data-notification-icon="security-review">
          <ShieldStatusIcon status="clock" />
        </span>
      );
    case 'SECURITY_REVIEW_CLEARED':
    case 'SECURITY_POST_PAYOUT_REVIEW_CLEARED':
      return (
        <span className="stageIconGraphic" data-notification-icon="security-cleared">
          <ShieldStatusIcon status="check" />
        </span>
      );
    case 'SECURITY_RESTRICTION_CONFIRMED':
    case 'SECURITY_INVITER_RESTRICTED':
    case 'SECURITY_REFERRAL_INVALIDATED':
      return (
        <span className="stageIconGraphic" data-notification-icon="security-restricted">
          <ShieldStatusIcon status="x" />
        </span>
      );
    case 'SECURITY_INVITER_WATCH':
      return (
        <span className="stageIconGraphic" data-notification-icon="security-watch">
          <IconFrame>
            <path d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="2.5" />
          </IconFrame>
        </span>
      );
    case 'SECURITY_INVITER_ACCESS_RESTORED':
    case 'SECURITY_REFERRAL_RESTORED':
      return (
        <span className="stageIconGraphic" data-notification-icon="security-restored">
          <IconFrame>
            <path d="M5.2 8.2A8 8 0 1 1 4 14M5.2 8.2V3.8M5.2 8.2h4.4M8.5 12l2.2 2.2 4.8-5" />
          </IconFrame>
        </span>
      );
  }
}

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

function UserStatusIcon({ status }: { status: 'check' | 'plus' }) {
  return (
    <IconFrame>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.6-3.2 2.4-5 5.5-5 1.4 0 2.5.3 3.4.9" />
      {status === 'check' ? (
        <path d="m14.5 17 2 2 4-4.5" />
      ) : (
        <path d="M17.5 13.5v7M14 17h7" />
      )}
    </IconFrame>
  );
}

function ShieldStatusIcon({ status }: { status: 'check' | 'clock' | 'x' }) {
  return (
    <IconFrame>
      <path d="M12 3 19 6v5c0 4.6-2.7 7.8-7 10-4.3-2.2-7-5.4-7-10V6Z" />
      {status === 'check' ? <path d="m8.7 12 2.1 2.1 4.5-4.5" /> : null}
      {status === 'clock' ? <path d="M12 8.5V12l2.3 1.5" /> : null}
      {status === 'x' ? <path d="m9.5 9.5 5 5m0-5-5 5" /> : null}
    </IconFrame>
  );
}

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
  const security = SECURITY_NOTIFICATION_COPY[locale];
  const inviterSecurity = INVITER_SECURITY_NOTIFICATION_COPY[locale];
  const inviterHold = INVITER_HOLD_NOTIFICATION_COPY[locale];
  const securityCleared = SECURITY_REVIEW_CLEARED_COPY[locale];
  const invalidated = REFERRAL_INVALIDATED_COPY[locale];
  const restored = REFERRAL_RESTORED_COPY[locale];
  const postPayout = POST_PAYOUT_SECURITY_NOTIFICATION_COPY[locale];

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
      return notification.collapsedProgress
        ? {
            title: copy.rewardTitle,
            body: `${v2.rewardReadyBody} ${copy.rewardBody}`,
            hint: null,
          }
        : {
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
    case 'SECURITY_REVIEW_STARTED':
      return {
        title: security.reviewTitle,
        body: security.reviewBody,
        hint: null,
      };
    case 'SECURITY_REVIEW_CLEARED':
      return {
        title: securityCleared.title,
        body: securityCleared.body,
        hint: null,
      };
    case 'SECURITY_POST_PAYOUT_REVIEW_STARTED':
      return {
        title: postPayout.reviewTitle,
        body: postPayout.reviewBody,
        hint: null,
      };
    case 'SECURITY_POST_PAYOUT_REVIEW_CLEARED':
      return {
        title: postPayout.clearedTitle,
        body: postPayout.clearedBody,
        hint: null,
      };
    case 'SECURITY_RESTRICTION_CONFIRMED':
      return {
        title: security.restrictionTitle,
        body: security.restrictionBody,
        hint: null,
      };
    case 'SECURITY_INVITER_WATCH':
      return {
        title: inviterSecurity.watchTitle,
        body: inviterSecurity.watchBody,
        hint: null,
      };
    case 'SECURITY_INVITER_HOLD':
      return {
        title: inviterHold.title,
        body: inviterHold.body,
        hint: null,
      };
    case 'SECURITY_INVITER_RESTRICTED':
      return {
        title: inviterSecurity.restrictedTitle,
        body: inviterSecurity.restrictedBody,
        hint: null,
      };
    case 'SECURITY_INVITER_ACCESS_RESTORED':
      return {
        title: inviterSecurity.restoredTitle,
        body: inviterSecurity.restoredBody,
        hint: null,
      };
    case 'SECURITY_REFERRAL_INVALIDATED':
      return {
        title: invalidated.title,
        body: invalidated.body,
        hint: null,
      };
    case 'SECURITY_REFERRAL_RESTORED':
      return {
        title: restored.title,
        body: restored.body,
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
  if (notification.kind === 'SECURITY_REVIEW_STARTED') {
    return SECURITY_NOTIFICATION_COPY[locale].reviewTitle;
  }
  if (notification.kind === 'SECURITY_REVIEW_CLEARED') {
    return SECURITY_REVIEW_CLEARED_COPY[locale].title;
  }
  if (notification.kind === 'SECURITY_POST_PAYOUT_REVIEW_STARTED') {
    return POST_PAYOUT_SECURITY_NOTIFICATION_COPY[locale].reviewTitle;
  }
  if (notification.kind === 'SECURITY_POST_PAYOUT_REVIEW_CLEARED') {
    return POST_PAYOUT_SECURITY_NOTIFICATION_COPY[locale].clearedTitle;
  }
  if (notification.kind === 'SECURITY_RESTRICTION_CONFIRMED') {
    return SECURITY_NOTIFICATION_COPY[locale].restrictionTitle;
  }
  if (notification.kind === 'SECURITY_INVITER_WATCH') {
    return INVITER_SECURITY_NOTIFICATION_COPY[locale].watchTitle;
  }
  if (notification.kind === 'SECURITY_INVITER_HOLD') {
    return INVITER_HOLD_NOTIFICATION_COPY[locale].title;
  }
  if (notification.kind === 'SECURITY_INVITER_RESTRICTED') {
    return INVITER_SECURITY_NOTIFICATION_COPY[locale].restrictedTitle;
  }
  if (notification.kind === 'SECURITY_INVITER_ACCESS_RESTORED') {
    return INVITER_SECURITY_NOTIFICATION_COPY[locale].restoredTitle;
  }
  if (notification.kind === 'SECURITY_REFERRAL_INVALIDATED') {
    return REFERRAL_INVALIDATED_COPY[locale].title;
  }
  if (notification.kind === 'SECURITY_REFERRAL_RESTORED') {
    return REFERRAL_RESTORED_COPY[locale].title;
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

            <div
              className={`stageIcon ${multiple ? 'neutral' : stageIconTone(primary.kind)}`}
              aria-hidden="true"
            >
              <NotificationStageIcon
                notification={primary}
                count={notifications.length}
              />
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
        .stageIcon.positive { background:rgba(67,211,140,.14); color:#68e0a5; }
        .stageIcon.review { background:rgba(244,183,40,.15); color:#ffd04a; }
        .stageIcon.restricted { background:rgba(255,105,125,.14); color:#ff7c8d; }
        .stageIcon :global(.stageIconGraphic) { position:relative; width:32px; height:32px; display:grid; place-items:center; }
        .stageIcon :global(.stageIconGraphic svg) { width:32px; height:32px; }
        .stageIcon :global(.stageIconStack svg) { width:29px; height:29px; }
        .stageIcon :global(.stageIconCount) { position:absolute; inset-inline-end:-8px; bottom:-6px; min-width:20px; height:20px; box-sizing:border-box; padding:0 4px; display:grid; place-items:center; border:2px solid #2c2517; border-radius:999px; background:#ffd04a; color:#17120a; font-size:.58rem; font-weight:950; line-height:1; }
        .stageIcon :global(.stageIconProgress) { display:flex; align-items:baseline; color:currentColor; font-size:1.28rem; font-variant-numeric:tabular-nums; letter-spacing:-.04em; }
        .stageIcon :global(.stageIconProgress small) { font-size:.7rem; letter-spacing:-.02em; }
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
