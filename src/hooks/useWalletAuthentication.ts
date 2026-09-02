'use client';

import {
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  useSignMessage,
  useWallet as useVeChainKitWallet,
} from '@vechain/vechain-kit';
import {
  useWallet as useDappKitWallet,
} from '@vechain/dapp-kit-react';

const WALLET_PATTERN =
  /^0x[0-9a-fA-F]{40}$/;
const WALLET_SIGNATURE_TIMEOUT_MS = 15_000;
const WALLET_SIGNATURE_SETTLE_MS = 350;
const CANCEL_SETTLE_TIMEOUT_MS = 1_000;

type SessionResponse = {
  authenticated?: boolean;
  walletAddress?: string;
  expiresAt?: string;
  error?: string;
};

type ChallengeResponse = {
  walletAddress?: string;
  nonce?: string;
  expiresAt?: string;
  message?: string;
  error?: string;
};

type VerifyResponse = {
  walletAddress?: string;
  expiresAt?: string;
  error?: string;
};

type WalletCertificate = {
  purpose: 'agreement';
  payload: {
    type: 'text';
    content: string;
  };
  domain: string;
  timestamp: number;
  signer: string;
  signature: string;
};

type InFlightAuthentication = {
  walletAddress: string;
  promise: Promise<void>;
  cancel: () => void;
};

function wait(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: number | undefined;

  const timeout = new Promise<never>(
    (_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error(message)),
        timeoutMs,
      );
    },
  );

  try {
    return await Promise.race([
      promise,
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function readJson<T>(
  response: Response,
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(
      `VeInvite returned an invalid response (${response.status}).`,
    );
  }
}

export function useWalletAuthentication() {
  const { signMessage } =
    useSignMessage();
  const {
    connection,
    account,
  } = useVeChainKitWallet();
  const {
    account: dappKitAccount,
    requestCertificate,
  } = useDappKitWallet();

  const [
    isAuthenticating,
    setIsAuthenticating,
  ] = useState(false);

  const inFlightRef = useRef<
    InFlightAuthentication | null
  >(null);
  const authGenerationRef = useRef(0);

  const ensureWalletSession =
    useCallback(
      async (
        rawWalletAddress: string,
      ): Promise<void> => {
        const walletAddress =
          rawWalletAddress
            .trim()
            .toLowerCase();

        if (
          !WALLET_PATTERN.test(
            walletAddress,
          )
        ) {
          throw new Error(
            'Connected wallet address is invalid.',
          );
        }

        // Only one signature flow may own the session cookie at a time. A
        // reconnect/switch explicitly cancels the previous flow through
        // clearWalletSession, so this wait is bounded by the signature timeout
        // even if a wallet provider becomes unresponsive.
        while (inFlightRef.current) {
          const current =
            inFlightRef.current;

          if (
            current.walletAddress ===
            walletAddress
          ) {
            return current.promise;
          }

          try {
            await current.promise;
          } catch {
            // A failed previous-wallet proof does not prevent verifying the
            // newly connected wallet.
          }
        }

        const generation =
          authGenerationRef.current + 1;
        authGenerationRef.current = generation;
        const controller =
          new AbortController();

        const assertStillCurrent = () => {
          if (
            authGenerationRef.current !==
            generation
          ) {
            throw new Error(
              'Wallet verification was cancelled.',
            );
          }
        };

        const readCurrentSession = async () => {
          const response = await fetch(
            '/api/auth/session',
            {
              method: 'GET',
              cache: 'no-store',
              credentials: 'include',
              signal: controller.signal,
            },
          );
          const session =
            await readJson<SessionResponse>(response);

          if (!response.ok) {
            throw new Error(
              session.error ||
                'Could not check wallet verification.',
            );
          }

          return session;
        };

        let run!: Promise<void>;

        run = (async () => {
          setIsAuthenticating(true);

          try {
            const session =
              await readCurrentSession();

            assertStillCurrent();

            if (
              session.authenticated &&
              session.walletAddress
                ?.toLowerCase() ===
                walletAddress
            ) {
              return;
            }

            if (session.authenticated) {
              const logoutResponse =
                await fetch(
                  '/api/auth/session',
                  {
                    method: 'DELETE',
                    credentials: 'include',
                    signal: controller.signal,
                  },
                );

              if (!logoutResponse.ok) {
                throw new Error(
                  'Could not clear the previous wallet verification.',
                );
              }

              assertStillCurrent();
            }

            const challengeResponse =
              await fetch(
                '/api/auth/challenge',
                {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                  body: JSON.stringify({
                    walletAddress,
                  }),
                  signal: controller.signal,
                },
              );

            const challenge =
              await readJson<ChallengeResponse>(
                challengeResponse,
              );

            if (
              !challengeResponse.ok ||
              !challenge.message ||
              !challenge.nonce ||
              !challenge.expiresAt
            ) {
              throw new Error(
                challenge.error ||
                  'Could not create wallet verification.',
              );
            }

            assertStillCurrent();

            let signature: string | undefined;
            let certificate:
              | WalletCertificate
              | undefined;

            // VeWorld/DAppKit signs a VeChain certificate, not an Ethereum
            // personal_sign message. Preserve the certificate annex so the
            // backend can verify it with the VeChain SDK. A reconnect can leave
            // VeChainKit and DAppKit briefly out of sync, so reject a mismatched
            // signer instead of opening a request against stale wallet state.
            if (
              connection.isConnectedWithDappKit
            ) {
              const signer =
                account?.address
                  ?.trim()
                  .toLowerCase() ||
                walletAddress;
              const dappSigner =
                dappKitAccount
                  ?.trim()
                  .toLowerCase() || null;

              if (
                signer !== walletAddress ||
                dappSigner !== walletAddress
              ) {
                throw new Error(
                  'Wallet connection is still synchronizing. Please disconnect and reconnect the wallet.',
                );
              }

              // Let the newly established provider transport settle before the
              // ownership prompt is opened. VeWorld/VeChainKit can report the
              // account slightly before the signing channel is fully ready.
              await wait(
                WALLET_SIGNATURE_SETTLE_MS,
              );
              assertStillCurrent();

              const certResponse =
                await withTimeout(
                  requestCertificate(
                    {
                      purpose: 'agreement',
                      payload: {
                        type: 'text',
                        content:
                          challenge.message,
                      },
                    },
                    {
                      signer,
                    },
                  ),
                  WALLET_SIGNATURE_TIMEOUT_MS,
                  'Wallet signature request timed out.',
                );

              assertStillCurrent();

              signature =
                certResponse.signature;
              certificate = {
                purpose: 'agreement',
                payload: {
                  type: 'text',
                  content:
                    challenge.message,
                },
                domain:
                  certResponse.annex.domain,
                timestamp:
                  certResponse.annex.timestamp,
                signer:
                  certResponse.annex.signer,
                signature:
                  certResponse.signature,
              };
            } else {
              signature =
                await withTimeout(
                  signMessage(
                    challenge.message,
                  ),
                  WALLET_SIGNATURE_TIMEOUT_MS,
                  'Wallet signature request timed out.',
                );
              assertStillCurrent();
            }

            if (!signature) {
              throw new Error(
                'Wallet verification signature was not returned.',
              );
            }

            assertStillCurrent();

            const verifyResponse =
              await fetch(
                '/api/auth/verify',
                {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                  body: JSON.stringify({
                    walletAddress,
                    nonce:
                      challenge.nonce,
                    signature,
                    certificate,
                  }),
                  signal: controller.signal,
                },
              );

            const verified =
              await readJson<VerifyResponse>(
                verifyResponse,
              );

            assertStillCurrent();

            if (
              !verifyResponse.ok ||
              verified.walletAddress
                ?.toLowerCase() !==
                walletAddress
            ) {
              throw new Error(
                verified.error ||
                  'Wallet verification failed.',
              );
            }

            // Do not claim the wallet is verified until the browser actually
            // returns the newly issued persistent cookie. This catches cookie
            // storage problems immediately instead of surprising the user with
            // another phone signature after the next refresh.
            const persistedSession =
              await readCurrentSession();

            assertStillCurrent();

            if (
              !persistedSession.authenticated ||
              persistedSession.walletAddress
                ?.toLowerCase() !==
                walletAddress
            ) {
              throw new Error(
                'The browser did not retain the VeInvite wallet session. Please allow site cookies and try once more.',
              );
            }
          } finally {
            setIsAuthenticating(false);
          }
        })();

        inFlightRef.current = {
          walletAddress,
          promise: run,
          cancel: () => {
            controller.abort();
          },
        };

        try {
          await run;
        } finally {
          if (
            inFlightRef.current
              ?.promise === run
          ) {
            inFlightRef.current = null;
          }
        }
      },
      [
        account?.address,
        connection.isConnectedWithDappKit,
        dappKitAccount,
        requestCertificate,
        signMessage,
      ],
    );

  const clearWalletSession =
    useCallback(async () => {
      const current =
        inFlightRef.current;

      // This event represents an explicit VeInvite session clear. The wallet
      // gate uses it to distinguish real logout/switch actions from passive
      // WalletConnect transport churn during refresh.
      window.dispatchEvent(
        new Event(
          'veinvite-wallet-session-cleared',
        ),
      );

      // Invalidate the proof first. A wallet signature request is controlled by
      // the wallet and cannot always be programmatically dismissed, but any
      // late result must be unable to create a VeInvite session after logout.
      authGenerationRef.current += 1;
      inFlightRef.current = null;
      current?.cancel();

      let firstError: unknown;

      const clearServerSession =
        async () => {
          const response = await fetch(
            '/api/auth/session',
            {
              method: 'DELETE',
              credentials: 'include',
            },
          );

          if (!response.ok) {
            throw new Error(
              'Could not clear wallet verification.',
            );
          }
        };

      try {
        await clearServerSession();
      } catch (error) {
        firstError = error;
      }

      if (current) {
        // Do not let a frozen wallet prompt freeze the disconnect button. Give
        // an already-finishing verification a short bounded window, then clear
        // the cookie once more to cover a verify request that was already in
        // flight when cancellation started.
        try {
          await Promise.race([
            current.promise.catch(
              () => undefined,
            ),
            wait(
              CANCEL_SETTLE_TIMEOUT_MS,
            ),
          ]);
        } catch {
          // The final session clear below is authoritative.
        }

        try {
          await clearServerSession();
        } catch (error) {
          firstError ??= error;
        }
      }

      if (firstError) {
        throw firstError;
      }
    }, []);

  return {
    ensureWalletSession,
    clearWalletSession,
    isAuthenticating,
  };
}
