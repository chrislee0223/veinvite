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

const SESSION_CHECK_SURFACE_DELAY_MS = 450;

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
}: {
  children: ReactNode;
}) {
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
    useState<VerificationState>('idle');
  const [verifiedWallet, setVerifiedWallet] =
    useState<string | null>(null);
  const [locale, setLocale] =
    useState<Locale>('en');
  const [isDisconnecting, setIsDisconnecting] =
    useState(false);
  const [showCheckingSurface, setShowCheckingSurface] =
    useState(false);
  const attemptRef = useRef(0);
  const autoAttemptedWalletRef =
    useRef<string | null>(null);
  const pageLifecycleRef = useRef(false);

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
      // explicit logout and must never revoke the 7-day VeInvite session.
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
    const handleWalletDisconnected = () => {
      // Ignore provider teardown signals caused by page refresh/navigation.
      // The server session cookie is intentionally persistent and will be
      // checked again on the next page load. Explicit disconnect/switch flows
      // still clear it through clearWalletSession before disconnecting.
      if (
        pageLifecycleRef.current ||
        document.visibilityState === 'hidden'
      ) {
        return;
      }

      // VeChainKit emits this event for genuine wallet disconnects. Cancel any
      // ownership proof immediately and revoke the server-side VeInvite
      // session. clearWalletSession is deliberately bounded so a wallet prompt
      // that stopped responding cannot trap the app on this gate.
      attemptRef.current += 1;
      autoAttemptedWalletRef.current = null;
      setVerifiedWallet(null);
      setState('idle');

      void clearWalletSession().catch(
        (error) => {
          console.error(
            'Failed to clear VeInvite session after wallet disconnect event:',
            error,
          );
        },
      );
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

    // Existing server sessions normally resolve very quickly. Avoid flashing a
    // full-screen ownership-verification card during a normal refresh; only
    // show it when verification is actually taking long enough to matter.
    const timeoutId = window.setTimeout(() => {
      setShowCheckingSurface(true);
    }, SESSION_CHECK_SURFACE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state]);

  const verify = useCallback(async () => {
    if (!walletAddress) {
      setState('idle');
      setVerifiedWallet(null);
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
      attemptRef.current += 1;
      autoAttemptedWalletRef.current = null;
      setState('idle');
      setVerifiedWallet(null);
      return;
    }

    // Automatically verify once for each newly connected wallet. The first
    // action inside ensureWalletSession is a server-session lookup, so a valid
    // 7-day session is silently reused without opening a fresh wallet proof.
    // If a proof is genuinely required and the user rejects/fails it, remain on
    // the error screen until an explicit retry/disconnect action.
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

  // During normal refreshes, preserve a quiet transition while the existing
  // cookie is checked instead of flashing the ownership-verification card.
  if (
    state === 'idle' ||
    (state === 'checking' && !showCheckingSurface)
  ) {
    return (
      <div
        aria-hidden="true"
        style={{
          minHeight: '100dvh',
          background: '#080807',
        }}
      />
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
