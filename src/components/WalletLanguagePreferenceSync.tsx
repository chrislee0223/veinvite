'use client';

import { useEffect } from 'react';
import { useWallet } from '@vechain/vechain-kit';

import {
  isLocale,
  localeFromLanguageTag,
  resolveBrowserLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import {
  clearPendingManualLanguage,
  readPendingManualLanguage,
  readStoredLanguage,
  writeStoredLanguage,
} from '@/lib/i18n/languageStorage';

const SET_LANGUAGE_INTENT =
  'SET_WALLET_LANGUAGE_PREFERENCE';
const OBSERVE_DISPLAY_LANGUAGE_INTENT =
  'OBSERVE_WALLET_DISPLAY_LANGUAGE';
const APP_READY_EVENT = 'veinvite-app-ready';
const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';

type LanguageUsageSource =
  | 'browser_auto'
  | 'query_param'
  | 'local_storage'
  | 'wallet_preference'
  | 'manual_selection';

type PreferenceResponse = {
  language?: unknown;
  error?: string;
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
): Promise<void> {
  await postLanguageState({
    intent: SET_LANGUAGE_INTENT,
    language,
    source: 'manual_selection',
  });
}

async function observeDisplayLanguage(
  language: SupportedLocale,
  source: Exclude<
    LanguageUsageSource,
    'manual_selection'
  >,
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
  writeStoredLanguage(language);
  document.documentElement.lang = language;
  window.dispatchEvent(
    new CustomEvent(
      'veinvite-language-change',
      { detail: language },
    ),
  );
}

function readQueryLanguage(): SupportedLocale | null {
  try {
    return localeFromLanguageTag(
      new URLSearchParams(
        window.location.search,
      ).get('lang'),
    );
  } catch {
    return null;
  }
}

function resolveObservedLanguage(
  pendingManualLanguage: SupportedLocale | null,
  queryLanguage: SupportedLocale | null,
  localLanguage: SupportedLocale | null,
): SupportedLocale {
  // Do not read document.documentElement.lang here. RootLayout starts at `en`
  // and route-level locale hydration can happen after this global component
  // mounts. Using durable/provenance-aware sources avoids recording that
  // transient default as the wallet's language.
  return (
    pendingManualLanguage ??
    queryLanguage ??
    localLanguage ??
    resolveBrowserLocale(
      window.navigator.languages,
      'en',
    )
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
    let changedLanguage: SupportedLocale | null = null;
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

      changedLanguage = language;

      if (!serverReady) {
        return;
      }

      void saveLanguage(language)
        .then(() => {
          clearPendingManualLanguage(language);
        })
        .catch(
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
          readStoredLanguage();
        const pendingManualLanguage =
          readPendingManualLanguage();
        const queryLanguage =
          readQueryLanguage();
        const observedLanguage =
          resolveObservedLanguage(
            pendingManualLanguage,
            queryLanguage,
            localLanguage,
          );

        // A language-change event is the strongest signal of current intent.
        // Keep the exact event value so a stale `?lang=` parameter can never
        // override a user change that happened while authentication was still
        // being established.
        if (changedLanguage) {
          await saveLanguage(changedLanguage);
          clearPendingManualLanguage(
            changedLanguage,
          );
          return;
        }

        const serverLanguage =
          isLocale(body.language)
            ? body.language
            : null;

        if (serverLanguage) {
          if (observedLanguage !== serverLanguage) {
            applyingRemote = true;
            applyLanguage(serverLanguage);
            applyingRemote = false;
          }

          await observeDisplayLanguage(
            serverLanguage,
            'wallet_preference',
          );
          clearPendingManualLanguage();
          return;
        }

        if (pendingManualLanguage) {
          await saveLanguage(
            pendingManualLanguage,
          );
          clearPendingManualLanguage(
            pendingManualLanguage,
          );
          return;
        }

        if (queryLanguage) {
          await observeDisplayLanguage(
            queryLanguage,
            'query_param',
          );
          return;
        }

        if (localLanguage) {
          // localStorage belongs to this browser, not to a wallet identity.
          // It may have been left by another wallet on a shared device, so
          // record only what this wallet is currently seeing. A wallet-level
          // preference is created only after an explicit language change while
          // that wallet has an authenticated session.
          await observeDisplayLanguage(
            localLanguage,
            'local_storage',
          );
          return;
        }

        await observeDisplayLanguage(
          observedLanguage,
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

    // Try immediately. If the authenticated session cookie is not ready yet,
    // the request fails harmlessly and the wallet-session-ready event retries.
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
