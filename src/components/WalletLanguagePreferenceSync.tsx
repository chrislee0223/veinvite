'use client';

import { useEffect } from 'react';
import { useWallet } from '@vechain/vechain-kit';

import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  type Locale,
} from '@/lib/i18n/locales';

const SET_LANGUAGE_INTENT =
  'SET_WALLET_LANGUAGE_PREFERENCE';
const SESSION_RETRY_MS = 400;
const SESSION_RETRY_LIMIT = 30;

type PreferenceResponse = {
  language?: unknown;
  error?: string;
};

type SessionResponse = {
  authenticated?: boolean;
  walletAddress?: string;
};

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function saveLanguage(
  language: Locale,
): Promise<void> {
  const response = await fetch(
    '/api/preferences/language',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: SET_LANGUAGE_INTENT,
        language,
      }),
    },
  );

  if (!response.ok) {
    const body =
      (await response.json().catch(() => ({}))) as PreferenceResponse;
    throw new Error(
      body.error ||
        'Language preference save failed.',
    );
  }
}

function applyLanguage(
  language: Locale,
) {
  window.localStorage.setItem(
    LANGUAGE_STORAGE_KEY,
    language,
  );
  document.documentElement.lang = language;
  window.dispatchEvent(
    new CustomEvent(
      'veinvite-language-change',
      { detail: language },
    ),
  );
}

async function waitForWalletSession(
  walletAddress: string,
  isCancelled: () => boolean,
): Promise<boolean> {
  for (
    let attempt = 0;
    attempt < SESSION_RETRY_LIMIT;
    attempt += 1
  ) {
    if (isCancelled()) {
      return false;
    }

    try {
      const response = await fetch(
        '/api/auth/session',
        { cache: 'no-store' },
      );
      const body =
        (await response.json()) as SessionResponse;
      const sessionWallet =
        body.walletAddress?.toLowerCase();

      if (
        response.ok &&
        body.authenticated === true &&
        sessionWallet === walletAddress
      ) {
        return true;
      }
    } catch {
      // Wallet verification may still be in progress. Retry below.
    }

    await wait(SESSION_RETRY_MS);
  }

  return false;
}

export function WalletLanguagePreferenceSync() {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.toLowerCase() ?? null;

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    let cancelled = false;
    let applyingRemote = false;
    let changedAfterMount = false;
    let serverReady = false;

    const handleLanguageChange = (
      event: Event,
    ) => {
      const language =
        (event as CustomEvent<unknown>).detail;

      if (!isLocale(language) || applyingRemote) {
        return;
      }

      changedAfterMount = true;

      if (!serverReady) {
        return;
      }

      void saveLanguage(language).catch(
        (error) => {
          console.warn(
            'Failed to persist VeInvite language preference:',
            error,
          );
        },
      );
    };

    window.addEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );

    const sync = async () => {
      const sessionReady =
        await waitForWalletSession(
          walletAddress,
          () => cancelled,
        );

      if (!sessionReady || cancelled) {
        return;
      }

      try {
        const response = await fetch(
          '/api/preferences/language',
          { cache: 'no-store' },
        );
        const body =
          (await response.json()) as PreferenceResponse;

        if (!response.ok) {
          throw new Error(
            body.error ||
              'Language preference lookup failed.',
          );
        }

        if (cancelled) {
          return;
        }

        serverReady = true;
        const localLanguage =
          window.localStorage.getItem(
            LANGUAGE_STORAGE_KEY,
          );

        if (changedAfterMount) {
          if (isLocale(localLanguage)) {
            await saveLanguage(localLanguage);
          }
          return;
        }

        const serverLanguage =
          isLocale(body.language)
            ? body.language
            : null;

        if (serverLanguage) {
          if (localLanguage !== serverLanguage) {
            applyingRemote = true;
            applyLanguage(serverLanguage);
            applyingRemote = false;
          }
          return;
        }

        if (isLocale(localLanguage)) {
          await saveLanguage(localLanguage);
        }
      } catch (error) {
        console.warn(
          'Failed to sync VeInvite language preference:',
          error,
        );
      }
    };

    void sync();

    return () => {
      cancelled = true;
      window.removeEventListener(
        'veinvite-language-change',
        handleLanguageChange,
      );
    };
  }, [walletAddress]);

  return null;
}
