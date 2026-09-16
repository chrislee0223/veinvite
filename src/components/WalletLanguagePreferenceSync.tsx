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
  walletAddress?: unknown;
  language?: unknown;
  error?: string;
};

async function postLanguageState({
  expectedWallet,
  intent,
  language,
  source,
}: {
  expectedWallet: string;
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
        expectedWallet,
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
  expectedWallet: string,
  language: SupportedLocale,
): Promise<void> {
  await postLanguageState({
    expectedWallet,
    intent: SET_LANGUAGE_INTENT,
    language,
    source: 'manual_selection',
  });
}

async function observeDisplayLanguage(
  expectedWallet: string,
  language: SupportedLocale,
  source: Exclude<
    LanguageUsageSource,
    'manual_selection'
  >,
): Promise<void> {
  await postLanguageState({
    expectedWallet,
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

      if (
        cancelled ||
        !isLocale(language) ||
        applyingRemote
      ) {
        return;
      }

      changedLanguage = language;

      if (!serverReady) {
        return;
      }

      void saveLanguage(walletAddress, language)
        .then(() => {
          if (cancelled) return;
          clearPendingManualLanguage(language);
        })
        .catch(
          (error) => {
            if (cancelled) return;
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

        if (
          cancelled ||
          typeof body.walletAddress !== 'string' ||
          body.walletAddress.toLowerCase() !== walletAddress
        ) {
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
          if (cancelled) return;
          await saveLanguage(
            walletAddress,
            changedLanguage,
          );
          if (cancelled) return;
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
          if (cancelled) return;

          if (observedLanguage !== serverLanguage) {
            applyingRemote = true;
            applyLanguage(serverLanguage);
            applyingRemote = false;
          }

          if (cancelled) return;
          await observeDisplayLanguage(
            walletAddress,
            serverLanguage,
            'wallet_preference',
          );
          if (cancelled) return;
          clearPendingManualLanguage();
          return;
        }

        if (pendingManualLanguage) {
          if (cancelled) return;
          await saveLanguage(
            walletAddress,
            pendingManualLanguage,
          );
          if (cancelled) return;
          clearPendingManualLanguage(
            pendingManualLanguage,
          );
          return;
        }

        if (queryLanguage) {
          if (cancelled) return;
          await observeDisplayLanguage(
            walletAddress,
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
          if (cancelled) return;
          await observeDisplayLanguage(
            walletAddress,
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

        if (cancelled) return;
        await observeDisplayLanguage(
          walletAddress,
          browserLanguage,
          'browser_auto',
        );
      } catch (error) {
        if (cancelled) return;
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
