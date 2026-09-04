'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  useConnectModal,
  useWallet,
} from '@vechain/vechain-kit';

import { Brand } from '@/components/Brand';
import {
  LegalConsentGate,
} from '@/components/LegalConsentGate';
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
  WALLET_SWITCH_COPY,
} from '@/lib/i18n/walletSwitchCopy';
import {
  isWalletSessionMismatch,
  markWalletConnectIntent,
  settleExplicitWalletDisconnect,
} from '@/lib/walletConnectionResume';

type VerificationState =
  | 'idle'
  | 'checking'
  | 'verified'
  | 'error';

const SESSION_CHECK_SURFACE_DELAY_MS = 3_000;
const SESSION_ERROR_SURFACE_DELAY_MS = 600;
const PASSIVE_DISCONNECT_GRACE_MS = 7_000;
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
  const {
    open: openConnectModal,
  } = useConnectModal();
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
  const pendingErrorTimerRef =
    useRef<number | null>(null);
  const bootReadyDispatchedRef = useRef(false);
  const sessionWalletRef =
    useRef<string | null>(initialWallet);

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
      sessionWalletRef.current = null;
      document
        .querySelector<HTMLElement>(
          '[data-veinvite-session-bootstrap]',
        )
        ?.setAttribute(
          'data-veinvite-session-bootstrap',
          'none',
        );
      if (pendingErrorTimerRef.current !== null) {
        window.clearTimeout(pendingErrorTimerRef.current);
        pendingErrorTimerRef.current = null;
      }
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
      if (pendingErrorTimerRef.current !== null) {
        window.clearTimeout(pendingErrorTimerRef.current);
        pendingErrorTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const scheduleConfirmedDisconnect = () => {
      if (
        pageLifecycleRef.current ||
        document.visibilityState === 'hidden' ||
        walletAddressRef.current ||
        !sessionWalletRef.current
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

          if (
            pageLifecycleRef.current ||
            document.visibilityState === 'hidden' ||
            walletAddressRef.current ||
            !sessionWalletRef.current
          ) {
            return;
          }

          // A provider disconnect can be transient while VeWorld is restoring.
          // Only after the visible grace period expires with wallet still null
          // may we revoke the browser session without a live account. This also
          // covers a user disconnecting VeInvite directly from VeWorld.
          void clearWalletSession({
            confirmedDisconnected: true,
          }).catch((error) => {
            console.error(
              'Failed to clear VeInvite session after confirmed wallet disconnect:',
              error,
            );
          });
        }, PASSIVE_DISCONNECT_GRACE_MS);
    };

    const handleWalletDisconnected = () => {
      scheduleConfirmedDisconnect();
    };
    const handlePageShow = () => {
      window.setTimeout(
        scheduleConfirmedDisconnect,
        0,
      );
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleConfirmedDisconnect();
      }
    };

    window.addEventListener(
      'wallet_disconnected',
      handleWalletDisconnected,
    );
    window.addEventListener(
      'pageshow',
      handlePageShow,
    );
    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );

    // A returning page can already be wallet=null before event listeners mount.
    // Arm the same bounded confirmation path; a restored wallet cancels it.
    const initialSchedule = window.setTimeout(
      scheduleConfirmedDisconnect,
      0,
    );

    return () => {
      window.clearTimeout(initialSchedule);
      window.removeEventListener(
        'wallet_disconnected',
        handleWalletDisconnected,
      );
      window.removeEventListener(
        'pageshow',
        handlePageShow,
      );
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, [clearWalletSession]);

  useEffect(() => {
    if (state !== 'checking') {
      setShowCheckingSurface(false);
      return;
    }

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

    if (pendingErrorTimerRef.current !== null) {
      window.clearTimeout(pendingErrorTimerRef.current);
      pendingErrorTimerRef.current = null;
    }

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;

    setState('checking');

    try {
      await ensureWalletSession(walletAddress);

      if (attemptRef.current !== attempt) {
        return;
      }

      sessionWalletRef.current = walletAddress;
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
      pendingErrorTimerRef.current = window.setTimeout(() => {
        pendingErrorTimerRef.current = null;

        if (attemptRef.current !== attempt) {
          return;
        }

        setState('error');
      }, SESSION_ERROR_SURFACE_DELAY_MS);
    }
  }, [
    ensureWalletSession,
    walletAddress,
  ]);

  const retryVerification = useCallback(async () => {
    if (!walletAddress || isDisconnecting) {
      return;
    }

    const sessionWallet = sessionWalletRef.current;

    // When VeWorld was switched outside VeInvite, the provider can already be
    // on wallet B while this browser still owns a verified VeInvite session for
    // wallet A. The primary action explicitly authorizes replacing only this
    // browser session while keeping wallet B connected.
    if (
      isWalletSessionMismatch(
        sessionWallet,
        walletAddress,
      )
    ) {
      setIsDisconnecting(true);

      try {
        await clearWalletSession();
        autoAttemptedWalletRef.current = walletAddress;
        await verify();
      } catch (error) {
        console.error(
          'Failed to switch VeInvite verification to the connected wallet:',
          error,
        );
        setState('error');
      } finally {
        setIsDisconnecting(false);
      }
      return;
    }

    await verify();
  }, [
    clearWalletSession,
    isDisconnecting,
    verify,
    walletAddress,
  ]);

  useEffect(() => {
    const handleInvalidWalletSession = () => {
      attemptRef.current += 1;
      autoAttemptedWalletRef.current = null;
      bootReadyDispatchedRef.current = false;
      sessionWalletRef.current = null;
      setVerifiedWallet(null);

      if (!walletAddress) {
        setState('idle');
        return;
      }

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

    sessionWalletRef.current = initialWallet;
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

      setIsDisconnecting(true);

      try {
        // If session revocation fails, do not disconnect the provider. Keeping
        // the wallet attached leaves the user recoverable and avoids recreating
        // the stale-cookie/startup deadlock that triggered this fix.
        await clearWalletSession();
      } catch (error) {
        console.error(
          'Failed to clear VeInvite wallet session from verification screen:',
          error,
        );
        setState('error');
        setIsDisconnecting(false);
        return;
      }

      const previousWallet = walletAddressRef.current;

      try {
        await disconnect();
        const released =
          await settleExplicitWalletDisconnect({
            previousWallet,
            readCurrentWallet: () =>
              walletAddressRef.current,
          });

        if (!released) {
          throw new Error(
            'Wallet disconnect did not finish.',
          );
        }

        setState('idle');
      } catch (error) {
        console.error(
          'Failed to disconnect wallet from verification screen:',
          error,
        );
        // The browser session is already gone. If the provider remains, expose
        // a real verification action instead of leaving a blank loading shell.
        setState('error');
      } finally {
        setIsDisconnecting(false);
      }
    }, [
      clearWalletSession,
      disconnect,
      isDisconnecting,
    ]);

  const chooseAnotherWallet =
    useCallback(async () => {
      if (isDisconnecting) {
        return;
      }

      setIsDisconnecting(true);

      try {
        await clearWalletSession();
      } catch (error) {
        console.error(
          'Failed to clear VeInvite session before choosing another wallet:',
          error,
        );
        setState('error');
        setIsDisconnecting(false);
        return;
      }

      const previousWallet = walletAddressRef.current;

      try {
        await disconnect();
        const released =
          await settleExplicitWalletDisconnect({
            previousWallet,
            readCurrentWallet: () =>
              walletAddressRef.current,
          });

        if (!released) {
          throw new Error(
            'Wallet disconnect did not finish.',
          );
        }

        markWalletConnectIntent();
        openConnectModal();
        setState('idle');
      } catch (error) {
        console.error(
          'Failed to open another wallet from verification screen:',
          error,
        );
        setState('error');
      } finally {
        setIsDisconnecting(false);
      }
    }, [
      clearWalletSession,
      disconnect,
      isDisconnecting,
      openConnectModal,
    ]);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

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
  const switchT = WALLET_SWITCH_COPY[
    isLocale(locale) ? locale : 'en'
  ];
  const hasError = state === 'error';
  const walletMismatch =
    hasError &&
    isWalletSessionMismatch(
      sessionWalletRef.current,
      walletAddress,
    );

  return (
    <div
      data-veinvite-wallet-session-gate="interactive"
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
            background: walletMismatch
              ? 'rgba(244,183,40,0.14)'
              : hasError
                ? 'rgba(255,113,134,0.12)'
                : 'rgba(244,183,40,0.14)',
            color: walletMismatch
              ? '#ffd66e'
              : hasError
                ? '#ff8da0'
                : '#ffd66e',
            fontSize: '1.35rem',
            fontWeight: 900,
          }}
        >
          {walletMismatch
            ? '↔'
            : hasError
              ? '!'
              : '✓'}
        </div>

        <strong
          style={{
            fontSize: '1.25rem',
            letterSpacing: '-0.02em',
          }}
        >
          {walletMismatch
            ? switchT.title
            : hasError
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
          {walletMismatch
            ? switchT.description
            : hasError
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
                void retryVerification();
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
              {walletMismatch
                ? switchT.continueCurrent
                : t.tryAgain}
            </button>
          ) : null}

          <button
            type="button"
            disabled={isDisconnecting}
            onClick={() => {
              if (walletMismatch) {
                void chooseAnotherWallet();
              } else {
                void disconnectFromVerification();
              }
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
            {walletMismatch
              ? switchT.chooseAnother
              : isDisconnecting
                ? t.disconnectingWallet
                : t.disconnectWallet}
          </button>
        </div>
      </div>
    </div>
  );
}
