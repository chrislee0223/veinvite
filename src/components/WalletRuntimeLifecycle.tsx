'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useWallet } from '@vechain/vechain-kit';

import {
  APP_STARTUP_ERROR_EVENT,
  HOME_STARTUP_STATE_EVENT,
  readPublishedHomeStartupState,
  resolveStartupReadiness,
  shouldHoldForWalletBootstrap,
  type HomeStartupState,
} from '@/lib/homeStartupReadiness';
import {
  readPersistedDappKitAccount,
} from '@/lib/walletConnectionResume';

const APP_READY_EVENT = 'veinvite-app-ready';
const APP_LOADING_EVENT = 'veinvite-app-loading';
const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';
const SESSION_RENEWAL_INTENT = 'renew';
const RENEWAL_DEDUPE_MS = 60_000;
const HOME_STABILITY_MS = 160;
const BROWSER_WALLET_BOOTSTRAP_SETTLE_MS = 350;
const VEWORLD_WALLET_BOOTSTRAP_SETTLE_MS = 3_500;
const INTERACTIVE_WALLET_GATE_SELECTOR =
  '[data-veinvite-wallet-session-gate="interactive"]';

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
  const { account, connection } = useWallet();
  const walletAddress =
    account?.address?.trim().toLowerCase() ?? null;
  const [walletBootstrapSettled, setWalletBootstrapSettled] =
    useState(false);
  const walletRef = useRef<string | null>(walletAddress);
  const lastStartupWalletRef =
    useRef<string | null>(walletAddress);
  const homeStateRef = useRef<HomeStartupState | null>(null);
  const releasedRef = useRef(false);
  const hasReleasedOnceRef = useRef(false);
  const readinessTimerRef = useRef<number | null>(null);
  const startupErrorReportedRef = useRef(false);
  const lastRenewalRef =
    useRef<SuccessfulRenewal | null>(null);
  const inFlightRenewalRef =
    useRef<InFlightRenewal | null>(null);

  useEffect(() => {
    walletRef.current = walletAddress;
  }, [walletAddress]);

  useEffect(() => {
    const previousWallet = lastStartupWalletRef.current;
    lastStartupWalletRef.current = walletAddress;

    if (
      !walletAddress ||
      previousWallet === walletAddress ||
      document.documentElement.dataset.veinviteAppReady !== 'true'
    ) {
      return;
    }

    if (readinessTimerRef.current !== null) {
      window.clearTimeout(readinessTimerRef.current);
      readinessTimerRef.current = null;
    }

    releasedRef.current = false;
    startupErrorReportedRef.current = false;
    document.documentElement.dataset.veinviteAppReady = 'false';
    window.dispatchEvent(new Event(APP_LOADING_EVENT));
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      setWalletBootstrapSettled(true);
      return;
    }

    if (connection?.isLoading) {
      setWalletBootstrapSettled(false);
      return;
    }

    setWalletBootstrapSettled(false);
    const hasPersistedWallet =
      Boolean(readPersistedDappKitAccount());
    const settleDelay =
      connection?.isInAppBrowser && hasPersistedWallet
        ? VEWORLD_WALLET_BOOTSTRAP_SETTLE_MS
        : BROWSER_WALLET_BOOTSTRAP_SETTLE_MS;
    const timer = window.setTimeout(() => {
      setWalletBootstrapSettled(true);
    }, settleDelay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    connection?.isInAppBrowser,
    connection?.isLoading,
    walletAddress,
  ]);

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
              { status: response.status },
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
    if (!walletAddress) return;
    void renewSession(walletAddress);
  }, [renewSession, walletAddress]);

  useEffect(() => {
    const handleWalletSessionReady = () => {
      const wallet = walletRef.current;
      if (wallet) void renewSession(wallet);
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
    if (window.location.pathname !== '/') return;

    const clearReadinessTimer = () => {
      if (readinessTimerRef.current !== null) {
        window.clearTimeout(readinessTimerRef.current);
        readinessTimerRef.current = null;
      }
    };

    const releaseApp = () => {
      if (releasedRef.current) return;

      releasedRef.current = true;
      hasReleasedOnceRef.current = true;
      startupErrorReportedRef.current = false;
      clearReadinessTimer();
      document.documentElement.dataset.veinviteAppReady = 'true';
      window.dispatchEvent(new Event(APP_READY_EVENT));
    };

    const reportStartupError = (
      homeState: HomeStartupState | null,
    ) => {
      clearReadinessTimer();
      if (startupErrorReportedRef.current) return;

      startupErrorReportedRef.current = true;
      window.dispatchEvent(
        new CustomEvent(APP_STARTUP_ERROR_EVENT, {
          detail: { message: homeState?.errorMessage },
        }),
      );
    };

    const hasInteractiveGate = () =>
      Boolean(
        document.querySelector(
          INTERACTIVE_WALLET_GATE_SELECTOR,
        ),
      );
    const hasBootstrappedSession = () =>
      document
        .querySelector('[data-veinvite-session-bootstrap]')
        ?.getAttribute('data-veinvite-session-bootstrap') === 'verified';
    const hasPersistedVeWorldWallet = () =>
      Boolean(readPersistedDappKitAccount());

    const getDecision = () => {
      const interactiveGateVisible = hasInteractiveGate();
      const currentHomeState =
        readPublishedHomeStartupState() ?? homeStateRef.current;

      return {
        currentHomeState,
        interactiveGateVisible,
        decision: resolveStartupReadiness({
          walletAddress: walletRef.current,
          homeState: currentHomeState,
          hasBootstrappedSession: hasBootstrappedSession(),
          hasPersistedWallet: hasPersistedVeWorldWallet(),
          interactiveGateVisible,
          allowHomeDataHydration: !hasReleasedOnceRef.current,
        }),
      };
    };

    const scheduleStableRelease = (
      expectedWallet: string | null,
    ) => {
      clearReadinessTimer();
      readinessTimerRef.current = window.setTimeout(() => {
        readinessTimerRef.current = null;

        if (
          releasedRef.current ||
          walletRef.current !== expectedWallet
        ) {
          return;
        }

        const interactiveGateVisible = hasInteractiveGate();
        if (
          shouldHoldForWalletBootstrap({
            walletAddress: walletRef.current,
            walletBootstrapSettled,
            interactiveGateVisible,
          })
        ) {
          return;
        }

        const {
          currentHomeState,
          decision,
        } = getDecision();

        if (decision === 'release') {
          releaseApp();
        } else if (decision === 'error') {
          reportStartupError(currentHomeState);
        }
      }, HOME_STABILITY_MS);
    };

    const evaluate = () => {
      if (releasedRef.current) return;

      const interactiveGateVisible = hasInteractiveGate();
      if (
        shouldHoldForWalletBootstrap({
          walletAddress: walletRef.current,
          walletBootstrapSettled,
          interactiveGateVisible,
        })
      ) {
        clearReadinessTimer();
        startupErrorReportedRef.current = false;
        return;
      }

      const {
        currentHomeState,
        decision,
      } = getDecision();

      if (decision === 'release') {
        startupErrorReportedRef.current = false;
        scheduleStableRelease(walletRef.current);
        return;
      }

      clearReadinessTimer();

      if (decision === 'error') {
        reportStartupError(currentHomeState);
        return;
      }

      startupErrorReportedRef.current = false;
    };

    const handleHomeStartupState = (event: Event) => {
      const detail =
        (event as CustomEvent<HomeStartupState>).detail;
      if (!detail) return;

      homeStateRef.current = detail;
      evaluate();
    };

    window.addEventListener(
      HOME_STARTUP_STATE_EVENT,
      handleHomeStartupState,
    );

    const observer = new MutationObserver(evaluate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    homeStateRef.current = readPublishedHomeStartupState();
    evaluate();

    return () => {
      window.removeEventListener(
        HOME_STARTUP_STATE_EVENT,
        handleHomeStartupState,
      );
      observer.disconnect();
      clearReadinessTimer();
    };
  }, [walletAddress, walletBootstrapSettled]);

  return null;
}
