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
  const [errorMessage, setErrorMessage] =
    useState('');
  const attemptRef = useRef(0);

  const verify = useCallback(async () => {
    if (!walletAddress) {
      setState('idle');
      setVerifiedWallet(null);
      setErrorMessage('');
      return;
    }

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;

    setState('checking');
    setErrorMessage('');

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
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Wallet verification failed.',
      );
      setState('error');
    }
  }, [
    ensureWalletSession,
    walletAddress,
  ]);

  useEffect(() => {
    if (!walletAddress) {
      attemptRef.current += 1;
      setState('idle');
      setVerifiedWallet(null);
      setErrorMessage('');
      return;
    }

    if (
      verifiedWallet === walletAddress &&
      state === 'verified'
    ) {
      return;
    }

    void verify();
  }, [
    walletAddress,
    verifiedWallet,
    state,
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

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: '#120d20',
        color: '#ffffff',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          display: 'grid',
          gap: '14px',
        }}
      >
        <strong>
          {state === 'error'
            ? 'Wallet verification needed'
            : 'Verifying your wallet'}
        </strong>

        <span
          style={{
            opacity: 0.78,
            lineHeight: 1.5,
          }}
        >
          {state === 'error'
            ? errorMessage ||
              'Please verify that you control the connected wallet.'
            : 'Confirm the signature request to prove ownership. This does not create a transaction or cost gas.'}
        </span>

        {state === 'error' ? (
          <button
            type="button"
            onClick={() => {
              void verify();
            }}
            style={{
              minHeight: '44px',
              borderRadius: '12px',
              border: 0,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
