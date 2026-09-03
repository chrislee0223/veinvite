'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  useWallet,
} from '@vechain/vechain-kit';

import { Brand } from '@/components/Brand';
import {
  useWalletAuthentication,
} from '@/hooks/useWalletAuthentication';
import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  resolveBrowserLocale,
  type Locale,
} from '@/lib/i18n/locales';
import {
  WALLET_SESSION_COPY,
} from '@/lib/i18n/walletSessionCopy';
import {
  LegalConsentGate,
} from '@/components/LegalConsentGate';

type VerificationState =
  | 'idle'
  | 'checking'
  | 'verified'
  | 'error';

const SESSION_CHECK_SURFACE_DELAY_MS = 3_000;
const PASSIVE_DISCONNECT_GRACE_MS = 8_000;
const SESSION_CLEARED_EVENT =
  'veinvite-wallet-session-cleared';
const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';
const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';

function initialLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = window.localStorage.getItem(
    LANGUAGE_STORAGE_KEY,
  );

  if (isLocale(saved)) {
    return saved;
  }

  return resolveBrowserLocale(
    window.navigator.languages,
    'en',
  );
}

export function WalletSessionGate({
  children,
  initialSessionWallet = null,
}: {
  children: ReactNode;
  initialSessionWallet?: string | null;
}) {
  const initialWallet =
    initialSessionWallet?.toLowerCase() ?? null;
  const {
    account,
    disconnect,
  } = useWallet();
  const walletAddress =
    account?.address?.toLowerCase() ?? null;

  const {
    ensureWalletSession,
    clearWalletSession,
  } = useWalletAuthentication();

  const [state, setState] =
    useState<VerificationState>(
      initialWallet ? 'verified' : 'idle',
    );
  const [verifiedWallet, setVerifiedWallet] =
    useState<string | null>(initialWallet);
  const [locale, setLocale] =
    useState<Locale>('en');
  const [isDisconnecting, setIsDisconnecting] =
    useState(false);
  const [showCheckingSurface, setShowCheckingSurface] =
    useState(false);
  const attemptRef = useRef(0);
  const autoAttemptedWalletRef =
    useRef<string | null>(initialWallet);
  const pageLifecycleRef = useRef(false);
  const walletAddressRef =
    useRef<string | null>(walletAddress);
  const pendingDisconnectTimerRef =
    useRef<number | null>(null);
  const bootReadyDispatchedRef = useRef(false);

  useEffect(() => {
    setLocale(initialLocale());

    const handleLanguageChange = (
      event: Event,
    ) => {
      const detail =
        (event as CustomEvent<unknown>).detail;

      if (isLocale(detail)) {
        setLocale(detail);
      }
    };

    window.addEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );

    return () => {
      window.removeEventListener(
        'veinvite-language-change',
        handleLanguageChange,
      );
    };
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      // A browser refresh/navigation can make the wallet provider emit a
      // transient disconnect while React is being torn down. That is not an
      // explicit logout and must never revoke the 30-day VeInvite session.
      pageLifecycleRef.current = true;
    };
    const handlePageShow = () => {
      pageLifecycleRef.current = false;
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  useEffect(() => {
    const handleSessionCleared = () => {
      attemptRef.current += 1;
      autoAttemptedWalletRef.current = null;
      bootReadyDispatchedRef.current = false;
      setVerifiedWallet(null);
      setState('idle');
    };

    window.addEventListener(
      SESSION_CLEARED_EVENT,
      handleSessionCleared,
    );

    return () => {
      window.removeEventListener(
        SESSION_CLEARED_EVENT,
        handleSessionCleared,
      );
    };
  }, []);

  useEffect(() => {
    walletAddressRef.current = walletAddress;

    // WalletConnect/VeWorld can briefly report a disconnect while restoring
    // the same transport after refresh. Once the wallet reappears, cancel the
    // pending passive-disconnect check and keep the existing 30-day session.
    if (
      walletAddress &&
      pendingDisconnectTimerRef.current !== null
    ) {
      window.clearTimeout(
        pendingDisconnectTimerRef.current,
      );
      pendingDisconnectTimerRef.current = null;
    }
  }, [walletAddress]);

  useEffect(() => {
    return () => {
      if (
        pendingDisconnectTimerRef.current !== null
      ) {
        window.clearTimeout(
          pendingDisconnectTimerRef.current,
        );
        pendingDisconnectTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleWalletDisconnected = () => {
      // Refresh/navigation teardown can emit wallet_disconnected before or
      // even just after pageshow. Never revoke the persistent browser session
      // immediately from a provider event; first give the transport time to
      // restore the same wallet. Explicit VeInvite disconnect/switch actions
      // clear the server session through clearWalletSession and emit the
      // session-cleared event immediately.
      if (
        pageLifecycleRef.current ||
        document.visibilityState === 'hidden'
      ) {
        return;
      }

      if (
        pendingDisconnectTimerRef.current !== null
      ) {
        window.clearTimeout(
          pendingDisconnectTimerRef.current,
        );
      }

      pendingDisconnectTimerRef.current =
        window.setTimeout(() => {
          pendingDisconnectTimerRef.current = null;

          // A restored wallet means this was only transport churn. Keep both
          // the provider login and the existing 30-day VeInvite session intact.
          if (
            pageLifecycleRef.current ||
            document.visibilityState === 'hidden' ||
            walletAddressRef.current
          ) {
            return;
          }

          void clearWalletSession().catch(
            (error) => {
              console.error(
                'Failed to clear VeInvite session after confirmed wallet disconnect:',
                error,
              );
            },
          );
        }, PASSIVE_DISCONNECT_GRACE_MS);
    };

    window.addEventListener(
      'wallet_disconnected',
      handleWalletDisconnected,
    );

    return () => {
      window.removeEventListener(
        'wallet_disconnected',
        handleWalletDisconnected,
      );
    };
  }, [clearWalletSession]);

  useEffect(() => {
    if (state !== 'checking') {
      setShowCheckingSurface(false);
      return;
    }

    // A valid browser session should restore silently on refresh. Give the
    // server-session lookup enough time to finish before surfacing ownership
    // verification UI; a real first-time proof remains visible if it takes
    // longer and genuinely needs user attention.
    const timeoutId = window.setTimeout(() => {
      setShowCheckingSurface(true);
    }, SESSION_CHECK_SURFACE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state]);

  const verify = useCallback(async () => {
    if (!walletAddress) {
      return;
    }

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;

    setState('checking');

    try {
      await ensureWalletSession(walletAddress);

      if (attemptRef.current !== attempt) {
        return;
      }

      setVerifiedWallet(walletAddress);
      setState('verified');
      bootReadyDispatchedRef.current = true;
      window.dispatchEvent(
        new Event(WALLET_SESSION_READY_EVENT),
      );
    } catch (error) {
      if (attemptRef.current !== attempt) {
        return;
      }

      console.error(
        'Wallet ownership verification failed:',
        error,
      );

      setVerifiedWallet(null);
      setState('error');
    }
  }, [
    ensureWalletSession,
    walletAddress,
  ]);

  useEffect(() => {
    const handleInvalidWalletSession = () => {
      attemptRef.current += 1;
      autoAttemptedWalletRef.current = null;
      bootReadyDispatchedRef.current = false;
      setVerifiedWallet(null);

      if (!walletAddress) {
        setState('idle');
        return;
      }

      // A protected API has confirmed that the browser session is no longer
      // valid. Unmount protected children immediately and reuse the normal
      // wallet-verification path rather than allowing each child to keep
      // polling with a known-invalid cookie.
      void verify();
    };

    window.addEventListener(
      WALLET_SESSION_INVALID_EVENT,
      handleInvalidWalletSession,
    );

    return () => {
      window.removeEventListener(
        WALLET_SESSION_INVALID_EVENT,
        handleInvalidWalletSession,
      );
    };
  }, [verify, walletAddress]);

  useEffect(() => {
    if (
      bootReadyDispatchedRef.current ||
      !initialWallet ||
      walletAddress !== initialWallet ||
      state !== 'verified' ||
      verifiedWallet !== initialWallet
    ) {
      return;
    }

    // A server-validated session can skip verify() entirely on refresh. Once
    // the same wallet transport has restored, publish the same readiness event
    // that a fresh verification would publish so dependent sync work remains
    // event-driven without forcing another phone signature.
    bootReadyDispatchedRef.current = true;
    window.dispatchEvent(
      new Event(WALLET_SESSION_READY_EVENT),
    );
  }, [
    initialWallet,
    state,
    verifiedWallet,
    walletAddress,
  ]);

  const disconnectFromVerification =
    useCallback(async () => {
      if (isDisconnecting) {
        return;
      }

      // Invalidate any result from the current attempt before clearing the
      // VeInvite session and the wallet-provider connection. This button stays
      // available even while a signature request is pending so the user always
      // has a recovery path from a stuck wallet provider.
      attemptRef.current += 1;
      autoAttemptedWalletRef.current = null;
      bootReadyDispatchedRef.current = false;
      setVerifiedWallet(null);
      setIsDisconnecting(true);

      let disconnectFailed = false;

      try {
        await clearWalletSession();
      } catch (error) {
        disconnectFailed = true;
        console.error(
          'Failed to clear VeInvite wallet session from verification screen:',
          error,
        );
      }

      try {
        await disconnect();
      } catch (error) {
        disconnectFailed = true;
        console.error(
          'Failed to disconnect wallet from verification screen:',
          error,
        );
      } finally {
        setIsDisconnecting(false);
      }

      // A successful provider disconnect makes walletAddress null and returns
      // the user to the normal connect screen. If the provider itself failed,
      // keep this recovery screen available so the user can try again.
      setState(disconnectFailed ? 'error' : 'idle');
    }, [
      clearWalletSession,
      disconnect,
      isDisconnecting,
    ]);

  useEffect(() => {
    if (!walletAddress) {
      // Do not erase a valid bootstrapped/verified session merely because the
      // WalletConnect transport is briefly absent during refresh. The passive
      // disconnect grace path or an explicit session-cleared event owns that
      // transition instead.
      return;
    }

    // A server-validated session is bootstrapped into autoAttemptedWalletRef on
    // navigation. When VeChainKit restores that same wallet, no client proof or
    // phone signature is needed at all. A genuinely new/different wallet still
    // runs the normal ownership proof exactly once.
    if (
      autoAttemptedWalletRef.current ===
      walletAddress
    ) {
      return;
    }

    autoAttemptedWalletRef.current =
      walletAddress;
    setVerifiedWallet(null);
    void verify();
  }, [
    walletAddress,
    verify,
  ]);

  if (!walletAddress) {
    return children;
  }

  if (
    state === 'verified' &&
    verifiedWallet === walletAddress
  ) {
    return (
      <LegalConsentGate
        walletAddress={walletAddress}
        locale={locale}
        onDisconnect={disconnectFromVerification}
        isDisconnecting={isDisconnecting}
      >
        {children}
      </LegalConsentGate>
    );
  }

  // Keep the transition branded instead of replacing the entire app with a
  // featureless black frame while the wallet provider/session initializes.
  if (
    state === 'idle' ||
    (state === 'checking' && !showCheckingSurface)
  ) {
    return (
      <div
        aria-hidden="true"
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background:
            'radial-gradient(circle at 50% 38%, rgba(244,183,40,0.10), transparent 32%), #080807',
        }}
      >
        <Brand compact />
      </div>
    );
  }

  const t = WALLET_SESSION_COPY[locale];
  const hasError = state === 'error';

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        boxSizing: 'border-box',
        padding: '24px',
        background:
          'radial-gradient(circle at 50% 32%, rgba(244,183,40,0.16), transparent 34%), #080807',
        color: '#ffffff',
        textAlign: 'center',
      }}
    >
      <div
        aria-live="polite"
        style={{
          width: 'min(420px, 100%)',
          boxSizing: 'border-box',
          display: 'grid',
          gap: '14px',
          padding: '26px 22px',
          border:
            '1px solid rgba(255,205,80,0.22)',
          borderRadius: '24px',
          background:
            'rgba(18,20,33,0.92)',
          boxShadow:
            '0 24px 70px rgba(0,0,0,0.34)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '48px',
            height: '48px',
            margin: '0 auto 2px',
            display: 'grid',
            placeItems: 'center',
            borderRadius: '16px',
            background: hasError
              ? 'rgba(255,113,134,0.12)'
              : 'rgba(244,183,40,0.14)',
            color: hasError
              ? '#ff8da0'
              : '#ffd66e',
            fontSize: '1.35rem',
            fontWeight: 900,
          }}
        >
          {hasError ? '!' : '✓'}
        </div>

        <strong
          style={{
            fontSize: '1.25rem',
            letterSpacing: '-0.02em',
          }}
        >
          {hasError
            ? t.errorTitle
            : t.checkingTitle}
        </strong>

        <span
          style={{
            opacity: 0.82,
            lineHeight: 1.55,
            fontSize: '0.92rem',
          }}
        >
          {hasError
            ? t.errorDescription
            : t.checkingDescription}
        </span>

        {!hasError ? (
          <span
            style={{
              opacity: 0.58,
              lineHeight: 1.5,
              fontSize: '0.78rem',
            }}
          >
            {t.checkingSafety}
          </span>
        ) : null}

        <div
          style={{
            display: 'grid',
            gap: '10px',
            marginTop: '4px',
          }}
        >
          {hasError ? (
            <button
              type="button"
              disabled={isDisconnecting}
              onClick={() => {
                void verify();
              }}
              style={{
                width: '100%',
                minHeight: '48px',
                borderRadius: '14px',
                border: 0,
                background:
                  'linear-gradient(135deg, #ffd24d, #efa718)',
                color: '#17120a',
                cursor: isDisconnecting
                  ? 'wait'
                  : 'pointer',
                font: 'inherit',
                fontWeight: 800,
                opacity: isDisconnecting ? 0.62 : 1,
              }}
            >
              {t.tryAgain}
            </button>
          ) : null}

          <button
            type="button"
            disabled={isDisconnecting}
            onClick={() => {
              void disconnectFromVerification();
            }}
            style={{
              width: '100%',
              minHeight: '46px',
              borderRadius: '14px',
              border:
                '1px solid rgba(255,255,255,0.16)',
              background:
                'rgba(255,255,255,0.04)',
              color: '#f8f6ef',
              cursor: isDisconnecting
                ? 'wait'
                : 'pointer',
              font: 'inherit',
              fontWeight: 750,
              opacity: isDisconnecting ? 0.62 : 0.9,
            }}
          >
            {isDisconnecting
              ? t.disconnectingWallet
              : t.disconnectWallet}
          </button>
        </div>
      </div>
    </div>
  );
}
