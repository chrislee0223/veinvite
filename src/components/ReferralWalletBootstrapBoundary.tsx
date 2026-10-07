'use client';

import {
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useWallet } from '@vechain/vechain-kit';

import { Brand } from './Brand';
import {
  readPersistedDappKitAccount,
} from '@/lib/walletConnectionResume';

const BROWSER_WALLET_BOOTSTRAP_SETTLE_MS = 350;
const VEWORLD_WALLET_BOOTSTRAP_SETTLE_MS = 3_500;
const REFERRAL_WALLET_BOOTSTRAP_MAX_HOLD_MS = 5_000;

/**
 * Direct referral routes are opened outside Home and can otherwise reveal their
 * anonymous landing screen for a frame before VeWorld restores a persisted
 * account. Hold only the initial provider bootstrap, then stay permanently
 * released for this page lifetime. WalletSessionGate remains authoritative for
 * later provider gaps, explicit disconnects, wallet switches and verification.
 */
export function ReferralWalletBootstrapBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { account, connection } = useWallet();
  const walletAddress =
    account?.address?.trim().toLowerCase() ?? null;
  const [settled, setSettled] = useState(
    Boolean(walletAddress),
  );

  useEffect(() => {
    if (settled) {
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      setSettled(true);
    }, REFERRAL_WALLET_BOOTSTRAP_MAX_HOLD_MS);

    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [settled]);

  useEffect(() => {
    if (settled) {
      return;
    }

    if (walletAddress) {
      setSettled(true);
      return;
    }

    if (connection?.isLoading) {
      return;
    }

    const hasPersistedWallet = Boolean(
      readPersistedDappKitAccount(),
    );
    const settleDelay =
      connection?.isInAppBrowser && hasPersistedWallet
        ? VEWORLD_WALLET_BOOTSTRAP_SETTLE_MS
        : BROWSER_WALLET_BOOTSTRAP_SETTLE_MS;

    const timer = window.setTimeout(() => {
      setSettled(true);
    }, settleDelay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    connection?.isInAppBrowser,
    connection?.isLoading,
    settled,
    walletAddress,
  ]);

  if (settled) {
    return children;
  }

  return (
    <div
      data-veinvite-referral-wallet-bootstrap="pending"
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
