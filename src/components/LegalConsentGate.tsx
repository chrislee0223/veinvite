'use client';

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { Brand } from './Brand';
import {
  LEGAL_CONSENT_COPY,
} from '@/lib/i18n/legalConsentCopy';
import type { Locale } from '@/lib/i18n/locales';
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGACY_LEGAL_STORAGE_KEY,
  LEGAL_CONSENT_INTENT,
  type LegalConsentSource,
} from '@/lib/legalConsent';

type GateState =
  | 'checking'
  | 'required'
  | 'accepted'
  | 'error';

type ConsentResponse = {
  accepted?: boolean;
  walletAddress?: string;
  error?: string;
};

type LegacyAgreement = {
  walletAddress?: unknown;
  url?: unknown;
  version?: unknown;
  required?: unknown;
};

type Props = {
  children: ReactNode;
  walletAddress: string;
  locale: Locale;
  onDisconnect: () => Promise<void>;
  isDisconnecting: boolean;
};

async function readConsentResponse(
  response: Response,
): Promise<ConsentResponse> {
  try {
    return (
      await response.json()
    ) as ConsentResponse;
  } catch {
    throw new Error(
      `VeInvite returned an invalid consent response (${response.status}).`,
    );
  }
}

function legacyAgreementMatches(
  value: LegacyAgreement,
  walletAddress: string,
  pathname: '/terms' | '/privacy',
  version: number,
): boolean {
  if (
    typeof value.walletAddress !== 'string' ||
    value.walletAddress.toLowerCase() !==
      walletAddress.toLowerCase() ||
    typeof value.url !== 'string' ||
    value.version !== version ||
    value.required !== true
  ) {
    return false;
  }

  try {
    return (
      new URL(
        value.url,
        window.location.origin,
      ).pathname === pathname
    );
  } catch {
    return false;
  }
}

function hasLegacyCurrentConsent(
  walletAddress: string,
): boolean {
  try {
    const raw = window.localStorage.getItem(
      LEGACY_LEGAL_STORAGE_KEY,
    );

    if (!raw) {
      return false;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return false;
    }

    const agreements = parsed.filter(
      (value): value is LegacyAgreement =>
        typeof value === 'object' &&
        value !== null,
    );

    const termsAccepted = agreements.some(
      (agreement) =>
        legacyAgreementMatches(
          agreement,
          walletAddress,
          '/terms',
          CURRENT_TERMS_VERSION,
        ),
    );
    const privacyAccepted = agreements.some(
      (agreement) =>
        legacyAgreementMatches(
          agreement,
          walletAddress,
          '/privacy',
          CURRENT_PRIVACY_VERSION,
        ),
    );

    return termsAccepted && privacyAccepted;
  } catch (error) {
    console.warn(
      'Could not migrate legacy VeInvite legal consent:',
      error,
    );
    return false;
  }
}

export function LegalConsentGate({
  children,
  walletAddress,
  locale,
  onDisconnect,
  isDisconnecting,
}: Props) {
  const [state, setState] =
    useState<GateState>('checking');
  const [isAccepting, setIsAccepting] =
    useState(false);
  const [reloadToken, setReloadToken] =
    useState(0);

  const recordConsent = useCallback(
    async (
      source: LegalConsentSource,
    ) => {
      const response = await fetch(
        '/api/legal/consent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            intent: LEGAL_CONSENT_INTENT,
            source,
          }),
        },
      );
      const result =
        await readConsentResponse(response);

      if (
        !response.ok ||
        result.accepted !== true ||
        result.walletAddress
          ?.toLowerCase() !==
          walletAddress.toLowerCase()
      ) {
        throw new Error(
          result.error ||
            'Legal consent was not saved.',
        );
      }
    },
    [walletAddress],
  );

  useEffect(() => {
    let active = true;
    const controller =
      new AbortController();

    const load = async () => {
      setState('checking');

      try {
        const response = await fetch(
          '/api/legal/consent',
          {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        const result =
          await readConsentResponse(response);

        if (!active) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            result.error ||
              'Legal consent could not be checked.',
          );
        }

        if (
          result.walletAddress &&
          result.walletAddress.toLowerCase() !==
            walletAddress.toLowerCase()
        ) {
          throw new Error(
            'Wallet session changed while checking legal consent.',
          );
        }

        if (result.accepted) {
          setState('accepted');
          return;
        }

        if (
          hasLegacyCurrentConsent(
            walletAddress,
          )
        ) {
          await recordConsent(
            'legacy-local-storage',
          );

          if (active) {
            setState('accepted');
          }
          return;
        }

        setState('required');
      } catch (error) {
        if (
          !active ||
          (error instanceof DOMException &&
            error.name === 'AbortError')
        ) {
          return;
        }

        console.error(
          'Failed to resolve VeInvite legal consent:',
          error,
        );
        setState('error');
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    recordConsent,
    reloadToken,
    walletAddress,
  ]);

  const acceptCurrentDocuments =
    useCallback(async () => {
      if (isAccepting) {
        return;
      }

      setIsAccepting(true);

      try {
        await recordConsent('ui');
        setState('accepted');
      } catch (error) {
        console.error(
          'Failed to accept VeInvite legal documents:',
          error,
        );
        setState('error');
      } finally {
        setIsAccepting(false);
      }
    }, [
      isAccepting,
      recordConsent,
    ]);

  if (state === 'accepted') {
    return children;
  }

  // Keep the exact startup brand surface visible while the server-side legal
  // consent check completes. This prevents the startup shield from revealing a
  // blank black frame before Home is ready.
  if (state === 'checking') {
    return (
      <div
        aria-hidden="true"
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background:
            'radial-gradient(circle at 50% 38%, rgba(244, 183, 40, 0.1), transparent 32%), #080807',
        }}
      >
        <Brand compact />
      </div>
    );
  }

  const t = LEGAL_CONSENT_COPY[locale];
  const failed = state === 'error';
  const busy =
    isAccepting || isDisconnecting;

  return (
    <div
      data-veinvite-legal-consent-gate="interactive"
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
        role={state === 'required' ? 'dialog' : undefined}
        aria-modal={state === 'required' ? true : undefined}
        aria-live="polite"
        style={{
          width: 'min(430px, 100%)',
          boxSizing: 'border-box',
          display: 'grid',
          gap: '14px',
          padding: '26px 22px',
          border:
            '1px solid rgba(255,205,80,0.22)',
          borderRadius: '24px',
          background:
            'rgba(18,20,33,0.94)',
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
            background: failed
              ? 'rgba(255,113,134,0.12)'
              : 'rgba(244,183,40,0.14)',
            color: failed
              ? '#ff8da0'
              : '#ffd66e',
            fontSize: '1.3rem',
            fontWeight: 900,
          }}
        >
          {failed ? '!' : '✓'}
        </div>

        <strong
          style={{
            fontSize: '1.22rem',
            letterSpacing: '-0.02em',
          }}
        >
          {failed
            ? t.errorTitle
            : t.title}
        </strong>

        <span
          style={{
            opacity: 0.82,
            lineHeight: 1.55,
            fontSize: '0.92rem',
          }}
        >
          {failed
            ? t.errorDescription
            : t.description}
        </span>

        {state === 'required' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(2, minmax(0, 1fr))',
              gap: '10px',
              marginTop: '2px',
            }}
          >
            <a
              href="/terms"
              style={{
                minHeight: '44px',
                display: 'grid',
                placeItems: 'center',
                borderRadius: '12px',
                border:
                  '1px solid rgba(255,255,255,0.14)',
                background:
                  'rgba(255,255,255,0.04)',
                color: '#f8f6ef',
                textDecoration: 'none',
                fontSize: '0.86rem',
                fontWeight: 700,
              }}
            >
              {t.terms}
            </a>
            <a
              href="/privacy"
              style={{
                minHeight: '44px',
                display: 'grid',
                placeItems: 'center',
                borderRadius: '12px',
                border:
                  '1px solid rgba(255,255,255,0.14)',
                background:
                  'rgba(255,255,255,0.04)',
                color: '#f8f6ef',
                textDecoration: 'none',
                fontSize: '0.86rem',
                fontWeight: 700,
              }}
            >
              {t.privacy}
            </a>
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gap: '10px',
            marginTop: '4px',
          }}
        >
          {state === 'required' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void acceptCurrentDocuments();
              }}
              style={{
                width: '100%',
                minHeight: '48px',
                borderRadius: '14px',
                border: 0,
                background:
                  'linear-gradient(135deg, #ffd24d, #efa718)',
                color: '#17120a',
                cursor: busy
                  ? 'wait'
                  : 'pointer',
                font: 'inherit',
                fontWeight: 800,
                opacity: busy ? 0.62 : 1,
              }}
            >
              {isAccepting
                ? t.accepting
                : t.acceptAll}
            </button>
          ) : null}

          {failed ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReloadToken(
                  (value) => value + 1,
                );
              }}
              style={{
                width: '100%',
                minHeight: '48px',
                borderRadius: '14px',
                border: 0,
                background:
                  'linear-gradient(135deg, #ffd24d, #efa718)',
                color: '#17120a',
                cursor: busy
                  ? 'wait'
                  : 'pointer',
                font: 'inherit',
                fontWeight: 800,
                opacity: busy ? 0.62 : 1,
              }}
            >
              {t.tryAgain}
            </button>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void onDisconnect();
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
              cursor: busy
                ? 'wait'
                : 'pointer',
              font: 'inherit',
              fontWeight: 750,
              opacity: busy ? 0.62 : 0.9,
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
