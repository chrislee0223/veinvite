'use client';

import { useEffect } from 'react';
import { useWallet } from '@vechain/vechain-kit';

import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  resolveBrowserLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';

const SET_LANGUAGE_INTENT =
  'SET_WALLET_LANGUAGE_PREFERENCE';
const OBSERVE_DISPLAY_LANGUAGE_INTENT =
  'OBSERVE_WALLET_DISPLAY_LANGUAGE';
const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';

type LanguageUsageSource =
  | 'browser_auto'
  | 'local_storage'
  | 'wallet_preference'
  | 'manual_selection';

type PreferenceResponse = {
  language?: unknown;
  error?: string;
};

type SessionResponse = {
  authenticated?: boolean;
  walletAddress?: string;
};

async function postLanguageState({
  intent,
  language,
  source,
}: {
  intent:
    | typeof SET_LANGUAGE_INTENT
    | typeof OBSERVE_DISPLAY_LANGUAGE_INTENT;
  language: SupportedLocale;
  source: LanguageUsageSource;
}): Promise<void> {
  const response = await fetch(
    '/api/preferences/language',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent,
        language,
        source,
      }),
    },
  );

  if (!response.ok) {
    const body =
      (await response.json().catch(() => ({}))) as PreferenceResponse;
    throw new Error(
      body.error ||
        'Language state save failed.',
    );
  }
}

async function saveLanguage(
  language: SupportedLocale,
  source:
    | 'manual_selection'
    | 'local_storage',
): Promise<void> {
  await postLanguageState({
    intent: SET_LANGUAGE_INTENT,
    language,
    source,
  });
}

async function observeDisplayLanguage(
  language: SupportedLocale,
  source:
    | 'browser_auto'
    | 'wallet_preference',
): Promise<void> {
  await postLanguageState({
    intent: OBSERVE_DISPLAY_LANGUAGE_INTENT,
    language,
    source,
  });
}

function applyLanguage(
  language: SupportedLocale,
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
    let syncStarted = false;

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

      void saveLanguage(
        language,
        'manual_selection',
      ).catch(
        (error) => {
          console.warn(
            'Failed to persist VeInvite language preference:',
            error,
          );
        },
      );
    };

    const syncPreference = async () => {
      if (cancelled || syncStarted) {
        return;
      }

      syncStarted = true;

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
            await saveLanguage(
              localLanguage,
              'manual_selection',
            );
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

          await observeDisplayLanguage(
            serverLanguage,
            'wallet_preference',
          );
          return;
        }

        if (isLocale(localLanguage)) {
          await saveLanguage(
            localLanguage,
            'local_storage',
          );
          return;
        }

        const browserLanguage =
          resolveBrowserLocale(
            window.navigator.languages,
            'en',
          );

        await observeDisplayLanguage(
          browserLanguage,
          'browser_auto',
        );
      } catch (error) {
        console.warn(
          'Failed to sync VeInvite language preference:',
          error,
        );
      }
    };

    const handleWalletSessionReady = () => {
      void syncPreference();
    };

    window.addEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );
    window.addEventListener(
      WALLET_SESSION_READY_EVENT,
      handleWalletSessionReady,
    );

    // Cover the case where WalletSessionGate restored an existing cookie just
    // before this sibling effect subscribed to the ready event. This is a
    // single session lookup; a session still being established will notify us
    // through WALLET_SESSION_READY_EVENT instead of being polled repeatedly.
    void (async () => {
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
          await syncPreference();
        }
      } catch {
        // Wallet verification may still be in progress. WalletSessionGate will
        // publish the ready event after verification succeeds.
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener(
        'veinvite-language-change',
        handleLanguageChange,
      );
      window.removeEventListener(
        WALLET_SESSION_READY_EVENT,
        handleWalletSessionReady,
      );
    };
  }, [walletAddress]);

  return null;
}
