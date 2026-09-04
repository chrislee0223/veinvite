'use client';

import {
  useEffect,
  useState,
} from 'react';

import { Brand } from './Brand';
import {
  APP_STARTUP_ERROR_EVENT,
} from '@/lib/homeStartupReadiness';
import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  resolveBrowserLocale,
  type Locale,
} from '@/lib/i18n/locales';
import { STARTUP_COPY } from '@/lib/i18n/startupCopy';

const APP_READY_EVENT = 'veinvite-app-ready';
const PROVIDER_READY_EVENT =
  'veinvite-provider-ready';
const STARTUP_RECOVERY_MS = 8_000;

type ShieldState =
  | { status: 'loading' }
  | { status: 'error'; message?: string }
  | { status: 'ready' };

function resolveStartupLocale(): Locale {
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

export function LocaleHydrationShield() {
  const [state, setState] = useState<ShieldState>({
    status: 'loading',
  });
  const [locale, setLocale] = useState<Locale>('en');

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
    let released = false;
    const isHome = window.location.pathname === '/';

    const release = () => {
      if (released) {
        return;
      }
      released = true;
      window.clearTimeout(fallbackTimer);

      // Keep one stable painted frame between the final app-ready signal and
      // removing the SSR-visible shield. This prevents a black/home flash while
      // the wallet provider, session gate, and Home settle underneath it.
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setState({ status: 'ready' });
        });
      });
    };

    const handleAppReady = () => {
      release();
    };
    const handleStartupError = (event: Event) => {
      if (released) {
        return;
      }

      const detail = (
        event as CustomEvent<{ message?: string }>
      ).detail;
      window.clearTimeout(fallbackTimer);
      setState({
        status: 'error',
        message: detail?.message,
      });
    };
    const handleProviderReady = () => {
      // Non-home informational routes do not use the wallet/session lifecycle,
      // so provider readiness is sufficient there. Home deliberately waits for
      // the stronger explicit startup-readiness signal.
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
    } else {
      window.addEventListener(
        APP_READY_EVENT,
        handleAppReady,
        { once: true },
      );
      window.addEventListener(
        APP_STARTUP_ERROR_EVENT,
        handleStartupError,
      );
      window.addEventListener(
        PROVIDER_READY_EVENT,
        handleProviderReady,
      );
    }

    // The old behavior forcibly exposed the underlying Home after 8 seconds.
    // On slow VeWorld restoration that could reveal a disconnected or skeleton
    // Home. Home now stays covered; the same bounded watchdog switches to an
    // explicit retry surface instead of releasing incomplete UI.
    fallbackTimer = window.setTimeout(() => {
      if (isHome) {
        setState({ status: 'error' });
      } else {
        release();
      }
    }, STARTUP_RECOVERY_MS);

    return () => {
      window.removeEventListener(
        APP_READY_EVENT,
        handleAppReady,
      );
      window.removeEventListener(
        APP_STARTUP_ERROR_EVENT,
        handleStartupError,
      );
      window.removeEventListener(
        PROVIDER_READY_EVENT,
        handleProviderReady,
      );
      window.clearTimeout(fallbackTimer);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  if (state.status === 'ready') return null;

  const t = STARTUP_COPY[locale];
  const hasError = state.status === 'error';

  return (
    <div
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
            onClick={() => window.location.reload()}
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
