'use client';

import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import { useVisiblePeriodicRefresh } from '@/hooks/useVisiblePeriodicRefresh';
import {
  SECURITY_STATUS_CHANGED_EVENT,
} from '@/lib/securityStatusClientEvents';

const RESTRICTION_REFRESH_MS = 30_000;
const RESTRICTION_RESUME_COOLDOWN_MS = 5_000;

export function useLiveWalletRestriction<T extends string>({
  enabled,
  walletAddress,
  verifiedWallet,
  walletAddressRef,
  sessionWalletRef,
  readRestriction,
  setRestrictionKind,
}: {
  enabled: boolean;
  walletAddress: string | null;
  verifiedWallet: string | null;
  walletAddressRef: MutableRefObject<string | null>;
  sessionWalletRef: MutableRefObject<string | null>;
  readRestriction: () => Promise<T | null>;
  setRestrictionKind: Dispatch<SetStateAction<T | null>>;
}) {
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  const refreshRestrictionState = useCallback(async () => {
    if (
      !enabled ||
      !verifiedWallet ||
      walletAddress !== verifiedWallet ||
      refreshInFlightRef.current
    ) {
      return;
    }

    const now = Date.now();
    if (
      now - lastRefreshAtRef.current <
      RESTRICTION_RESUME_COOLDOWN_MS
    ) {
      return;
    }

    refreshInFlightRef.current = true;
    lastRefreshAtRef.current = now;

    try {
      const activeRestriction = await readRestriction();

      if (
        walletAddressRef.current !== verifiedWallet ||
        sessionWalletRef.current !== verifiedWallet
      ) {
        return;
      }

      setRestrictionKind((current) => {
        if (current === activeRestriction) {
          return current;
        }

        window.dispatchEvent(
          new Event(SECURITY_STATUS_CHANGED_EVENT),
        );
        return activeRestriction;
      });
    } catch (error) {
      // Keep the last confirmed state on transient failures. A failed refresh
      // must never silently unlock a held or blocked wallet.
      console.warn(
        'Failed to refresh VeInvite participation restriction:',
        error,
      );
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [
    enabled,
    readRestriction,
    sessionWalletRef,
    setRestrictionKind,
    verifiedWallet,
    walletAddress,
    walletAddressRef,
  ]);

  useVisiblePeriodicRefresh({
    enabled,
    intervalMs: RESTRICTION_REFRESH_MS,
    onRefresh: refreshRestrictionState,
  });
}
