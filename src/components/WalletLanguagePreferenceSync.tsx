'use client';

import { useEffect } from 'react';
import { useWallet } from '@vechain/vechain-kit';

import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  localeFromLanguageTag,
  resolveBrowserLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import {
  clearPendingManualLanguage,
  readPendingManualLanguage,
} from '@/lib/i18n/pendingLanguageSelection';

const SET_LANGUAGE_INTENT =
  'SET_WALLET_LANGUAGE_PREFERENCE';
const OBSERVE_DISPLAY_LANGUAGE_INTENT =
  'OBSERVE_WALLET_DISPLAY_LANGUAGE';
const APP_READY_EVENT = 'veinvite-app-ready';
const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';

type LanguageUsageSource =
  | 'browser_auto'
  | 'local_storage'
  | 'query_param'
  | 'wallet_preference'
  | 'manual_selection';

type PreferenceResponse = {
  language?: unknown;
  error?: string;
};

function safeReadStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(
      LANGUAGE_STORAGE_KEY,
    );
  } catch {
    return null;
  }
}

function safeWriteStoredLanguage(
  language: SupportedLocale,
) {
  try {
    window.localStorage.setItem(
      LANGUAGE_STORAGE_KEY,
      language,
    );
  } catch {
    // Language state must remain usable in restricted WebViews.
  }
}

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
): Promise<void> {
  await postLanguageState({
    intent: SET_LANGUAGE_INTENT,
    language,
    source: 'manual_selection',
  });
}

async function observeDisplayLanguage(
  language: SupportedLocale,
  source:
    | 'browser_auto'
    | 'local_storage'
    | 'query_param'
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
  safeWriteStoredLanguage(language);
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

      void saveLanguage(language).catch(
        (error) => {
          console.warn(
            'Failed to persist VeInvite language preference:',
            error,
          );
        },
      );
    };

    const syncPreference = async () => {
      if (
        cancelled ||
        syncStarted
      ) {
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
          safeReadStoredLanguage();
        const queryLanguage =
          new URLSearchParams(
            window.location.search,
          ).get('lang');
        const queryLocale =
          localeFromLanguageTag(queryLanguage);
        const pendingManualLanguage =
          readPendingManualLanguage();
        const documentLocale =
          localeFromLanguageTag(
            document.documentElement.lang,
          );

        if (
          pendingManualLanguage &&
          documentLocale === pendingManualLanguage
        ) {
          await saveLanguage(
            pendingManualLanguage,
          );
          clearPendingManualLanguage();
          return;
        }

        if (changedAfterMount) {
          if (documentLocale) {
            await saveLanguage(documentLocale);
            return;
          }
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
          if (documentLocale !== serverLanguage) {
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

        if (queryLocale) {
          await observeDisplayLanguage(
            queryLocale,
            'query_param',
          );
          return;
        }

        if (isLocale(localLanguage)) {
          // localStorage belongs to this browser, not to a wallet identity.
          // It may have been left by another wallet on a shared device, so
          // record only what this wallet is currently seeing. A wallet-level
          // preference is created only after an explicit language choice.
          await observeDisplayLanguage(
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
        syncStarted = false;
        console.warn(
          'Failed to sync VeInvite language preference:',
          error,
        );
      }
    };

    const handleAppReady = () => {
      void syncPreference();
    };
    const handleWalletSessionReady = () => {
      void syncPreference();
    };

    window.addEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );
    window.addEventListener(
      APP_READY_EVENT,
      handleAppReady,
    );
    window.addEventListener(
      WALLET_SESSION_READY_EVENT,
      handleWalletSessionReady,
    );

    // Try immediately on every route. If the authenticated wallet session is
    // not ready yet, the request fails safely and WALLET_SESSION_READY retries.
    void syncPreference();

    return () => {
      cancelled = true;
      window.removeEventListener(
        'veinvite-language-change',
        handleLanguageChange,
      );
      window.removeEventListener(
        APP_READY_EVENT,
        handleAppReady,
      );
      window.removeEventListener(
        WALLET_SESSION_READY_EVENT,
        handleWalletSessionReady,
      );
    };
  }, [walletAddress]);

  return null;
}
