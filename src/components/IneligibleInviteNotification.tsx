'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useWalletLauncher } from './WalletControl';
import { INELIGIBLE_INVITER_COPY } from '@/lib/i18n/ineligibleInviterCopy';
import {
  isLocale,
  isRtlLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';

type IneligibleNotification = {
  inviteCode: string;
  kind: 'INVITE_INELIGIBLE';
  eventAt: string;
};

type NotificationResponse = {
  notification?: IneligibleNotification | null;
  unreadCount?: number;
  error?: string;
};

const REFRESH_MS = 30_000;
const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';

function readDocumentLocale(): SupportedLocale {
  const value = document.documentElement.lang;
  return isLocale(value) ? value : 'en';
}

export function IneligibleInviteNotification() {
  const { wallet } = useWalletLauncher();
  const [locale, setLocale] =
    useState<SupportedLocale>('en');
  const [notification, setNotification] =
    useState<IneligibleNotification | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState('');
  const shownKeyRef = useRef<string | null>(null);

  const copy =
    INELIGIBLE_INVITER_COPY[locale] ??
    INELIGIBLE_INVITER_COPY.en;
  const notificationCopy =
    NOTIFICATION_COPY[locale] ?? NOTIFICATION_COPY.en;
  const rtl = isRtlLocale(locale);

  const invalidateWalletSession = useCallback(() => {
    setNotification(null);
    setOpen(false);
    setErrorMessage('');
    shownKeyRef.current = null;
    window.dispatchEvent(
      new Event(WALLET_SESSION_INVALID_EVENT),
    );
  }, []);

  const refresh = useCallback(async () => {
    if (!wallet) {
      setNotification(null);
      setOpen(false);
      shownKeyRef.current = null;
      return;
    }

    try {
      const response = await fetch(
        '/api/notifications/ineligible',
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

      const next = body.notification ?? null;
      setNotification(next);

      if (!next) return;

      const key = `${next.inviteCode}:${next.eventAt}`;
      if (shownKeyRef.current !== key) {
        shownKeyRef.current = key;
        setErrorMessage('');
        setOpen(true);
      }
    } catch (error) {
      console.warn(
        'VeInvite ineligible notification refresh failed:',
        error,
      );
    }
  }, [invalidateWalletSession, wallet]);

  const acknowledge = useCallback(async () => {
    if (!notification || busy) return;

    setBusy(true);
    setErrorMessage('');

    try {
      const response = await fetch(
        '/api/notifications/ineligible',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inviteCode: notification.inviteCode,
          }),
        },
      );

      if (response.status === 401) {
        invalidateWalletSession();
        return;
      }

      const body = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          body.error ||
            notificationCopy.acknowledgementError,
        );
      }

      setOpen(false);
      setNotification(null);

      // Home keeps its invite list in client state. A single reload after this
      // rare terminal event guarantees the released slot and fresh invite CTA
      // are visible immediately without adding a permanent polling loop there.
      window.location.reload();
    } catch (error) {
      console.warn(
        'VeInvite ineligible notification acknowledgement failed:',
        error,
      );
      setErrorMessage(
        notificationCopy.acknowledgementError,
      );
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    invalidateWalletSession,
    notification,
    notificationCopy.acknowledgementError,
  ]);

  useEffect(() => {
    const syncLocale = () =>
      setLocale(readDocumentLocale());
    syncLocale();

    const onLanguageChange = () => syncLocale();
    window.addEventListener(
      'veinvite-language-change',
      onLanguageChange,
    );

    return () =>
      window.removeEventListener(
        'veinvite-language-change',
        onLanguageChange,
      );
  }, []);

  useEffect(() => {
    void refresh();

    if (!wallet) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }, REFRESH_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
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
  }, [refresh, wallet]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void acknowledge();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () =>
      document.removeEventListener('keydown', onKeyDown);
  }, [acknowledge, open]);

  if (!wallet || !notification || !open) {
    return null;
  }

  return (
    <div
      className="ineligibleBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          void acknowledge();
        }
      }}
    >
      <section
        className="ineligibleCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ineligible-invite-title"
        aria-describedby="ineligible-invite-body"
        lang={locale}
        dir={rtl ? 'rtl' : 'ltr'}
      >
        <button
          type="button"
          className="closeButton"
          aria-label={notificationCopy.closeAria}
          disabled={busy}
          onClick={() => void acknowledge()}
        >
          ×
        </button>

        <div className="statusIcon" aria-hidden="true">↻</div>

        <div className="copy">
          <h2 id="ineligible-invite-title">
            {copy.title}
          </h2>
          <p id="ineligible-invite-body">
            {copy.body}
          </p>
        </div>

        {errorMessage ? (
          <p className="error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="button"
          className="primaryButton"
          disabled={busy}
          onClick={() => void acknowledge()}
        >
          {notificationCopy.confirm}
        </button>
      </section>

      <style jsx>{`
        .ineligibleBackdrop {
          position: fixed;
          z-index: 145;
          inset: 0;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 20px;
          background: rgba(2,2,2,.72);
          backdrop-filter: blur(9px);
        }
        .ineligibleCard {
          position: relative;
          width: min(100%,520px);
          box-sizing: border-box;
          padding: 28px 24px 24px;
          display: grid;
          justify-items: center;
          gap: 17px;
          border: 1px solid rgba(255,205,80,.24);
          border-radius: 28px;
          background: linear-gradient(155deg,#211b10,#11110f 66%);
          color: #fff;
          text-align: center;
          box-shadow: 0 32px 90px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.07);
        }
        .closeButton {
          position: absolute;
          top: 13px;
          inset-inline-end: 15px;
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 0;
          background: transparent;
          color: #8b877f;
          font: inherit;
          font-size: 1.65rem;
          line-height: 1;
          cursor: pointer;
        }
        .statusIcon {
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          border-radius: 20px;
          background: rgba(244,183,40,.15);
          color: #ffd04a;
          font-size: 2rem;
          font-weight: 950;
        }
        .copy {
          min-width: 0;
          width: 100%;
        }
        .copy h2 {
          margin: 0;
          color: #fff;
          font-size: 1.25rem;
          line-height: 1.3;
          letter-spacing: -.025em;
          overflow-wrap: anywhere;
          text-wrap: balance;
        }
        .copy p {
          margin: 10px auto 0;
          max-width: 410px;
          color: #b5b0ba;
          font-size: .88rem;
          font-weight: 650;
          line-height: 1.6;
          overflow-wrap: normal;
          word-break: normal;
          text-wrap: pretty;
        }
        .error {
          margin: 0;
          color: #ff7c8d;
          font-size: .75rem;
          line-height: 1.4;
        }
        .primaryButton {
          width: 100%;
          min-height: 52px;
          border: 0;
          border-radius: 16px;
          background: linear-gradient(135deg,#ffd24d,#efa718);
          color: #17120a;
          font: inherit;
          font-size: .9rem;
          font-weight: 950;
          cursor: pointer;
          box-shadow: 0 14px 32px rgba(190,126,12,.2), inset 0 1px 0 rgba(255,255,255,.22);
        }
        .closeButton:disabled,
        .primaryButton:disabled {
          opacity: .55;
          cursor: not-allowed;
        }
        .ineligibleCard:lang(ko) :where(h2,p,button),
        .ineligibleCard:lang(ja) :where(h2,p,button),
        .ineligibleCard:lang(zh) :where(h2,p,button) {
          word-break: keep-all;
        }
        @media (max-width: 560px) {
          .ineligibleBackdrop {
            padding: 0;
          }
          .ineligibleCard {
            width: 100%;
            max-width: none;
            padding: 27px 20px max(24px,env(safe-area-inset-bottom));
            border-right: 0;
            border-bottom: 0;
            border-left: 0;
            border-radius: 27px 27px 0 0;
          }
          .statusIcon {
            width: 56px;
            height: 56px;
            border-radius: 18px;
          }
          .copy h2 {
            font-size: 1.15rem;
          }
        }
      `}</style>
    </div>
  );
}
