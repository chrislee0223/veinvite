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

type VerificationState =
  | 'idle'
  | 'checking'
  | 'verified'
  | 'error';

type Locale = 'ko' | 'en';

const LANGUAGE_STORAGE_KEY =
  'veinvite-language';

const COPY = {
  ko: {
    checkingTitle: '지갑을 확인하고 있어요',
    checkingDescription:
      '연결한 지갑의 소유권을 확인하려면 서명 요청을 승인해 주세요.',
    checkingSafety:
      '이 서명은 거래를 만들지 않으며 가스비가 들지 않아요.',
    errorTitle: '지갑 확인이 필요해요',
    errorDescription:
      '서명이 취소되었거나 지갑 확인에 실패했어요. 다시 시도해 주세요.',
    tryAgain: '다시 시도',
  },
  en: {
    checkingTitle: 'Verifying your wallet',
    checkingDescription:
      'Approve the signature request to confirm that you control the connected wallet.',
    checkingSafety:
      'This signature does not create a transaction or cost gas.',
    errorTitle: 'Wallet verification needed',
    errorDescription:
      'The signature was cancelled or wallet verification failed. Please try again.',
    tryAgain: 'Try again',
  },
} as const;

function initialLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = window.localStorage.getItem(
    LANGUAGE_STORAGE_KEY,
  );

  if (saved === 'ko' || saved === 'en') {
    return saved;
  }

  return window.navigator.language
    .toLowerCase()
    .startsWith('ko')
    ? 'ko'
    : 'en';
}

export function WalletSessionGate({
  children,
}: {
  children: ReactNode;
}) {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.toLowerCase() ?? null;

  const {
    ensureWalletSession,
  } = useWalletAuthentication();

  const [state, setState] =
    useState<VerificationState>('idle');
  const [verifiedWallet, setVerifiedWallet] =
    useState<string | null>(null);
  const [locale, setLocale] =
    useState<Locale>('en');
  const attemptRef = useRef(0);
  const autoAttemptedWalletRef =
    useRef<string | null>(null);

  useEffect(() => {
    setLocale(initialLocale());

    const handleLanguageChange = (
      event: Event,
    ) => {
      const detail =
        (event as CustomEvent<Locale>).detail;

      if (detail === 'ko' || detail === 'en') {
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

  useEffect(() => {
    if (!walletAddress) {
      attemptRef.current += 1;
      autoAttemptedWalletRef.current = null;
      setState('idle');
      setVerifiedWallet(null);
      return;
    }

    // Automatically verify once for each newly connected wallet. If the user
    // rejects or a verification attempt fails, remain on the error screen and
    // wait for the explicit retry button instead of repeatedly opening the
    // wallet signature prompt.
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
    return children;
  }

  const t = COPY[locale];
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

        {hasError ? (
          <button
            type="button"
            onClick={() => {
              void verify();
            }}
            style={{
              width: '100%',
              minHeight: '48px',
              marginTop: '4px',
              borderRadius: '14px',
              border: 0,
              background:
                'linear-gradient(135deg, #ffd24d, #efa718)',
              color: '#17120a',
              cursor: 'pointer',
              font: 'inherit',
              fontWeight: 800,
            }}
          >
            {t.tryAgain}
          </button>
        ) : null}
      </div>
    </div>
  );
}
