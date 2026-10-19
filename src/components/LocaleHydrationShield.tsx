'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';

import { Brand } from './Brand';
import {
  APP_STARTUP_ERROR_EVENT,
  HOME_STARTUP_STATE_EVENT,
  type HomeStartupState,
} from '@/lib/homeStartupReadiness';
import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  resolveBrowserLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { STARTUP_COPY } from '@/lib/i18n/startupCopy';

const APP_READY_EVENT = 'veinvite-app-ready';
const APP_LOADING_EVENT = 'veinvite-app-loading';
const PROVIDER_READY_EVENT =
  'veinvite-provider-ready';
const STARTUP_RECOVERY_MS = 18_000;
// The Home auto-retry backoff reaches 3,000ms. A smaller error grace
// flashes the full-page Retry screen before the next recovery begins.
const STARTUP_ERROR_GRACE_MS = 3_500;
const INTERACTIVE_STARTUP_GATE_SELECTOR = [
  '[data-veinvite-wallet-session-gate="interactive"]',
  '[data-veinvite-legal-consent-gate="interactive"]',
].join(', ');

type ShieldState =
  | { status: 'loading' }
  | { status: 'error'; message?: string }
  | { status: 'ready' };

function resolveStartupLocale(): SupportedLocale {
  // Storage can throw SecurityError in private or hardened wallet WebViews.
  // Startup copy must never block the authentication screen.
  try {
    const saved = window.localStorage.getItem(
      LANGUAGE_STORAGE_KEY,
    );
    if (isLocale(saved)) {
      return saved;
    }
  } catch {
    // Browser locale remains available when persisted preferences are blocked.
  }

  return resolveBrowserLocale(
    window.navigator.languages,
    'en',
  );
}

function hasInteractiveStartupGate(): boolean {
  return Boolean(
    document.querySelector(
      INTERACTIVE_STARTUP_GATE_SELECTOR,
    ),
  );
}

const NETWORK_SLOT_VISUAL_QA_PATH = '/qa/network-slot-visual';
const NOTIFICATION_LAYOUT_QA_PATH = '/qa/notification-state';
const X_PROMOTION_LAYOUT_QA_PATH = '/qa/x-promotion';

export function LocaleHydrationShield() {
  const pathname = usePathname();

  if (
    pathname === NETWORK_SLOT_VISUAL_QA_PATH ||
    pathname === NOTIFICATION_LAYOUT_QA_PATH ||
    pathname === X_PROMOTION_LAYOUT_QA_PATH
  ) {
    return null;
  }

  return <LocaleHydrationShieldRuntime />;
}

function LocaleHydrationShieldRuntime() {
  const [state, setState] = useState<ShieldState>({
    status: 'loading',
  });
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const shieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocale(resolveStartupLocale());

    const handleLanguageChange = (event: Event) => {
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
    let firstFrame = 0;
    let secondFrame = 0;
    let fallbackTimer = 0;
    let startupErrorTimer = 0;
    let loadingFrame = 0;
    let released = false;
    let interactiveGateVisible = false;
    const isHome = window.location.pathname === '/';

    const clearFallbackTimer = () => {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    };
    const clearStartupErrorTimer = () => {
      window.clearTimeout(startupErrorTimer);
      startupErrorTimer = 0;
    };

    const setShieldVisible = (visible: boolean) => {
      if (shieldRef.current) {
        shieldRef.current.style.visibility = visible
          ? 'visible'
          : 'hidden';
      }
    };

    const release = () => {
      if (released) {
        return;
      }
      released = true;
      clearFallbackTimer();
      clearStartupErrorTimer();

      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setState({ status: 'ready' });
        });
      });
    };

    const armFallbackTimer = () => {
      clearFallbackTimer();
      if (released || interactiveGateVisible) {
        return;
      }

      fallbackTimer = window.setTimeout(() => {
        if (isHome) {
          setShieldVisible(true);
          setState({ status: 'error' });
        } else {
          release();
        }
      }, STARTUP_RECOVERY_MS);
    };

    const syncInteractiveGate = () => {
      const nextVisible =
        isHome && hasInteractiveStartupGate();

      if (nextVisible === interactiveGateVisible) {
        return;
      }

      interactiveGateVisible = nextVisible;

      if (interactiveGateVisible) {
        clearFallbackTimer();
        setShieldVisible(false);
        return;
      }

      setShieldVisible(true);
      armFallbackTimer();
    };

    const handleAppReady = () => {
      release();
    };
    const handleAppLoading = () => {
      if (!isHome) {
        return;
      }

      released = false;
      clearFallbackTimer();
      clearStartupErrorTimer();
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      setState({ status: 'loading' });

      interactiveGateVisible = hasInteractiveStartupGate();
      loadingFrame = window.requestAnimationFrame(() => {
        setShieldVisible(!interactiveGateVisible);
        if (interactiveGateVisible) {
          clearFallbackTimer();
        } else {
          armFallbackTimer();
        }
      });
    };
    const handleStartupError = (event: Event) => {
      if (released) {
        return;
      }

      const detail = (
        event as CustomEvent<{ message?: string }>
      ).detail;
      clearFallbackTimer();
      clearStartupErrorTimer();
      // Keep the loading screen up for the full bounded retry backoff
      // (up to 3,000ms). Home's loading event cancels this timer when the
      // next attempt begins; a terminal failure still shows Retry.
      startupErrorTimer = window.setTimeout(() => {
        if (released || hasInteractiveStartupGate()) {
          return;
        }
        setShieldVisible(true);
        setState({
          status: 'error',
          message: detail?.message,
        });
      }, STARTUP_ERROR_GRACE_MS);
    };
    const handleHomeStartupState = (event: Event) => {
      if (!isHome || released) return;
      const status =
        (event as CustomEvent<HomeStartupState>).detail?.status;
      if (status === 'loading' && startupErrorTimer) {
        // A bounded Home retry has begun. A previous failed request's
        // 2.5-second error grace must not cover an in-flight recovery.
        clearStartupErrorTimer();
        setState({ status: 'loading' });
        // Re-arm the watchdog after the recoverable request resumes.
        // Otherwise cancelling the previous error grace also removes the
        // only fallback if this new request never reaches readiness.
        armFallbackTimer();
      }
    };
    const handleProviderReady = () => {
      if (!isHome) {
        release();
      }
    };

    if (
      document.documentElement.dataset
        .veinviteAppReady === 'true'
    ) {
      release();
    } else if (
      !isHome &&
      document.documentElement.dataset
        .veinviteProviderReady === 'true'
    ) {
      release();
    }

    window.addEventListener(
      APP_READY_EVENT,
      handleAppReady,
    );
    window.addEventListener(
      APP_LOADING_EVENT,
      handleAppLoading,
    );
    window.addEventListener(
      APP_STARTUP_ERROR_EVENT,
      handleStartupError,
    );
    window.addEventListener(
      HOME_STARTUP_STATE_EVENT,
      handleHomeStartupState,
    );
    window.addEventListener(
      PROVIDER_READY_EVENT,
      handleProviderReady,
    );

    interactiveGateVisible =
      isHome && hasInteractiveStartupGate();
    setShieldVisible(!interactiveGateVisible);

    if (!interactiveGateVisible) {
      armFallbackTimer();
    }

    const observer = isHome
      ? new MutationObserver(syncInteractiveGate)
      : null;
    observer?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      window.removeEventListener(
        APP_READY_EVENT,
        handleAppReady,
      );
      window.removeEventListener(
        APP_LOADING_EVENT,
        handleAppLoading,
      );
      window.removeEventListener(
        APP_STARTUP_ERROR_EVENT,
        handleStartupError,
      );
      window.removeEventListener(
        HOME_STARTUP_STATE_EVENT,
        handleHomeStartupState,
      );
      window.removeEventListener(
        PROVIDER_READY_EVENT,
        handleProviderReady,
      );
      observer?.disconnect();
      clearFallbackTimer();
      clearStartupErrorTimer();
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.cancelAnimationFrame(loadingFrame);
    };
  }, []);

  if (state.status === 'ready') return null;

  const t = STARTUP_COPY[locale];
  const hasError = state.status === 'error';

  return (
    <div
      ref={shieldRef}
      className="localeHydrationShield"
      aria-hidden={hasError ? undefined : true}
      role={hasError ? 'alert' : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'grid',
        placeItems: 'center',
        padding: hasError ? '24px' : undefined,
        boxSizing: 'border-box',
        background:
          'radial-gradient(circle at 50% 38%, rgba(244, 183, 40, 0.1), transparent 32%), #080807',
        pointerEvents: hasError ? 'auto' : 'none',
      }}
    >
      {hasError ? (
        <div
          style={{
            width: 'min(420px, 100%)',
            display: 'grid',
            gap: '14px',
            justifyItems: 'center',
            padding: '26px 22px',
            boxSizing: 'border-box',
            border:
              '1px solid rgba(255,205,80,0.22)',
            borderRadius: '24px',
            background: 'rgba(18,20,33,0.94)',
            boxShadow:
              '0 24px 70px rgba(0,0,0,0.34)',
            color: '#ffffff',
            textAlign: 'center',
          }}
        >
          <Brand compact />
          <strong
            style={{
              marginTop: '4px',
              fontSize: '1.15rem',
              letterSpacing: '-0.02em',
            }}
          >
            {t.errorTitle}
          </strong>
          <span
            style={{
              color: '#aaa5b3',
              fontSize: '0.88rem',
              lineHeight: 1.55,
            }}
          >
            {state.message || t.errorDescription}
          </span>
          <button
            type="button"
            onClick={() => {
              const homeStatus =
                document.documentElement.dataset.veinviteHomeStartupStatus;
              const homeWallet =
                document.documentElement.dataset.veinviteHomeStartupWallet;
              if (
                homeWallet &&
                (homeStatus === 'error' || homeStatus === 'loading')
              ) {
                // Recover the two authoritative Home reads in place instead
                // of repeating server bootstrap and wallet-provider startup.
                // The Home loader still checks the active wallet and keeps
                // authorization and referral ownership checks unchanged.
                window.dispatchEvent(new Event(APP_LOADING_EVENT));
                window.dispatchEvent(
                  new CustomEvent('veinvite-home-data-refresh-requested', {
                    detail: { manual: true },
                  }),
                );
              } else {
                // An unmounted Home / missing provider requires a true reload.
                window.location.reload();
              }
            }}
            style={{
              width: '100%',
              minHeight: '48px',
              marginTop: '4px',
              border: 0,
              borderRadius: '15px',
              background:
                'linear-gradient(135deg,#ffd24d,#efa718)',
              color: '#17120a',
              font: 'inherit',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {t.retry}
          </button>
        </div>
      ) : (
        <Brand compact />
      )}
    </div>
  );
}
