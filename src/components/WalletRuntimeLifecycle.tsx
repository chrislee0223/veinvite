'use client';

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useWallet } from '@vechain/vechain-kit';

const APP_READY_EVENT = 'veinvite-app-ready';
const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';
const SESSION_RENEWAL_INTENT = 'renew';
const RENEWAL_DEDUPE_MS = 60_000;
const HOME_STABILITY_MS = 160;
const DISCONNECTED_STABILITY_MS = 900;
const BOOTSTRAPPED_SESSION_GRACE_MS = 4_500;

type SessionResponse = {
  authenticated?: boolean;
  walletAddress?: string;
  expiresAt?: string;
  error?: string;
};

type SuccessfulRenewal = {
  walletAddress: string;
  renewedAt: number;
};

type InFlightRenewal = {
  walletAddress: string;
  promise: Promise<boolean>;
};

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function readSessionResponse(
  response: Response,
): Promise<SessionResponse> {
  try {
    return (await response.json()) as SessionResponse;
  } catch {
    return {};
  }
}

export function WalletRuntimeLifecycle() {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.trim().toLowerCase() ?? null;
  const walletRef = useRef<string | null>(walletAddress);
  const releasedRef = useRef(false);
  const readinessTimerRef = useRef<number | null>(null);
  const lastRenewalRef =
    useRef<SuccessfulRenewal | null>(null);
  const inFlightRenewalRef =
    useRef<InFlightRenewal | null>(null);

  useEffect(() => {
    walletRef.current = walletAddress;
  }, [walletAddress]);

  const renewSession = useCallback(
    async (wallet: string): Promise<boolean> => {
      const normalizedWallet =
        wallet.trim().toLowerCase();
      const recent = lastRenewalRef.current;

      if (
        recent?.walletAddress === normalizedWallet &&
        Date.now() - recent.renewedAt <
          RENEWAL_DEDUPE_MS
      ) {
        return true;
      }

      const inFlight = inFlightRenewalRef.current;

      if (
        inFlight?.walletAddress === normalizedWallet
      ) {
        return inFlight.promise;
      }

      const run = (async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const response = await fetch(
              '/api/auth/session',
              {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: {
                  'Content-Type': 'application/json',
                  'X-VeInvite-Session-Intent':
                    SESSION_RENEWAL_INTENT,
                },
                body: JSON.stringify({
                  walletAddress: normalizedWallet,
                }),
              },
            );
            const result =
              await readSessionResponse(response);

            if (
              response.ok &&
              result.authenticated === true &&
              result.walletAddress?.toLowerCase() ===
                normalizedWallet
            ) {
              lastRenewalRef.current = {
                walletAddress: normalizedWallet,
                renewedAt: Date.now(),
              };
              return true;
            }

            // Before a first-time ownership proof there is intentionally no
            // server session yet. WalletSessionGate will emit its ready event
            // after Sign succeeds, which retries renewal without another Sign.
            if (
              response.status === 401 ||
              response.status === 403
            ) {
              return false;
            }

            if (attempt < 2) {
              await wait(250 * (attempt + 1));
              continue;
            }

            console.warn(
              'VeInvite could not silently renew the wallet session.',
              {
                status: response.status,
              },
            );
            return false;
          } catch (error) {
            if (attempt < 2) {
              await wait(250 * (attempt + 1));
              continue;
            }

            console.warn(
              'VeInvite wallet-session renewal request failed.',
              error,
            );
            return false;
          }
        }

        return false;
      })();

      inFlightRenewalRef.current = {
        walletAddress: normalizedWallet,
        promise: run,
      };

      try {
        return await run;
      } finally {
        if (
          inFlightRenewalRef.current?.promise === run
        ) {
          inFlightRenewalRef.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    void renewSession(walletAddress);
  }, [renewSession, walletAddress]);

  useEffect(() => {
    const handleWalletSessionReady = () => {
      const wallet = walletRef.current;

      if (wallet) {
        void renewSession(wallet);
      }
    };

    window.addEventListener(
      WALLET_SESSION_READY_EVENT,
      handleWalletSessionReady,
    );

    return () => {
      window.removeEventListener(
        WALLET_SESSION_READY_EVENT,
        handleWalletSessionReady,
      );
    };
  }, [renewSession]);

  useEffect(() => {
    if (window.location.pathname !== '/') {
      return;
    }

    const clearReadinessTimer = () => {
      if (readinessTimerRef.current !== null) {
        window.clearTimeout(
          readinessTimerRef.current,
        );
        readinessTimerRef.current = null;
      }
    };

    const releaseApp = () => {
      if (releasedRef.current) {
        return;
      }

      releasedRef.current = true;
      clearReadinessTimer();
      document.documentElement.dataset.veinviteAppReady =
        'true';
      window.dispatchEvent(
        new Event(APP_READY_EVENT),
      );
    };

    const hasHome = () =>
      Boolean(document.querySelector('main.screen'));
    const hasInteractiveGate = () =>
      Boolean(
        document.querySelector(
          '[aria-live="polite"]',
        ),
      );
    const hasBootstrappedSession = () =>
      document
        .querySelector(
          '[data-veinvite-session-bootstrap]',
        )
        ?.getAttribute(
          'data-veinvite-session-bootstrap',
        ) === 'verified';

    const scheduleStableRelease = (
      delayMs: number,
      expectedWallet: string | null,
    ) => {
      clearReadinessTimer();
      readinessTimerRef.current =
        window.setTimeout(() => {
          readinessTimerRef.current = null;

          if (releasedRef.current || !hasHome()) {
            return;
          }

          if (
            walletRef.current !== expectedWallet
          ) {
            return;
          }

          releaseApp();
        }, delayMs);
    };

    const evaluate = () => {
      if (releasedRef.current) {
        return;
      }

      const wallet = walletRef.current;
      const homeVisible = hasHome();

      if (wallet) {
        // A genuine verification/legal-consent screen is actionable and should
        // replace the startup shield. Otherwise require the final home tree to
        // stay mounted briefly so a transient pre-restoration home frame never
        // flashes through in VeWorld.
        if (
          !homeVisible &&
          hasInteractiveGate()
        ) {
          releaseApp();
          return;
        }

        if (homeVisible) {
          scheduleStableRelease(
            HOME_STABILITY_MS,
            wallet,
          );
          return;
        }

        clearReadinessTimer();
        return;
      }

      if (!homeVisible) {
        clearReadinessTimer();
        return;
      }

      // Wallet providers can report no account for a short period while
      // restoring VeWorld/WalletConnect. If the server already validated a
      // persistent session, keep the single branded startup surface longer so
      // the disconnected home cannot flash before that wallet comes back.
      scheduleStableRelease(
        hasBootstrappedSession()
          ? BOOTSTRAPPED_SESSION_GRACE_MS
          : DISCONNECTED_STABILITY_MS,
        null,
      );
    };

    const observer = new MutationObserver(evaluate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    evaluate();

    return () => {
      observer.disconnect();
      clearReadinessTimer();
    };
  }, [walletAddress]);

  return null;
}
