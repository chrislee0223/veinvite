'use client';

import {
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  useSignMessage,
} from '@vechain/vechain-kit';

const WALLET_PATTERN =
  /^0x[0-9a-fA-F]{40}$/;

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

type InFlightAuthentication = {
  walletAddress: string;
  promise: Promise<void>;
};

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

  const [
    isAuthenticating,
    setIsAuthenticating,
  ] = useState(false);

  const inFlightRef = useRef<
    InFlightAuthentication | null
  >(null);

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

        // Only one signature flow may own the session cookie at a time. If
        // account A is being verified and the user switches to B, wait for A
        // to settle and then independently verify B. Never reuse A's promise
        // as proof for B.
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

        let run!: Promise<void>;

        run = (async () => {
          setIsAuthenticating(true);

          try {
            const sessionResponse =
              await fetch(
                '/api/auth/session',
                {
                  method: 'GET',
                  cache: 'no-store',
                },
              );

            const session =
              await readJson<SessionResponse>(
                sessionResponse,
              );

            if (!sessionResponse.ok) {
              throw new Error(
                session.error ||
                  'Could not check wallet verification.',
              );
            }

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
                  },
                );

              if (!logoutResponse.ok) {
                throw new Error(
                  'Could not clear the previous wallet verification.',
                );
              }
            }

            const challengeResponse =
              await fetch(
                '/api/auth/challenge',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                  body: JSON.stringify({
                    walletAddress,
                  }),
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

            const signature =
              await signMessage(
                challenge.message,
              );

            if (!signature) {
              throw new Error(
                'Wallet verification signature was not returned.',
              );
            }

            const verifyResponse =
              await fetch(
                '/api/auth/verify',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                  body: JSON.stringify({
                    walletAddress,
                    nonce:
                      challenge.nonce,
                    signature,
                  }),
                },
              );

            const verified =
              await readJson<VerifyResponse>(
                verifyResponse,
              );

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
          } finally {
            setIsAuthenticating(false);
          }
        })();

        inFlightRef.current = {
          walletAddress,
          promise: run,
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
      [signMessage],
    );

  const clearWalletSession =
    useCallback(async () => {
      const current =
        inFlightRef.current;

      if (current) {
        try {
          await current.promise;
        } catch {
          // Clear whatever session remains after a failed verification flow.
        }
      }

      const response = await fetch(
        '/api/auth/session',
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        throw new Error(
          'Could not clear wallet verification.',
        );
      }
    }, []);

  return {
    ensureWalletSession,
    clearWalletSession,
    isAuthenticating,
  };
}
