'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  resolveBrowserLocale,
  type Locale,
} from '@/lib/i18n/locales';

const VeChainKitProvider = dynamic(
  () => import('@vechain/vechain-kit').then((mod) => mod.VeChainKitProvider),
  { ssr: false },
);

export function VeChainProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;
  const [language, setLanguage] = useState<Locale>('en');

  useEffect(() => {
    const resolveLanguage = (): Locale => {
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isLocale(saved)) return saved;
      return resolveBrowserLocale(window.navigator.languages, 'en');
    };

    const applyLanguage = (nextLanguage: Locale, notifyApp: boolean) => {
      setLanguage(nextLanguage);
      document.documentElement.lang = nextLanguage;
      if (notifyApp) {
        window.dispatchEvent(new CustomEvent('veinvite-language-change', { detail: nextLanguage }));
      }
    };

    applyLanguage(resolveLanguage(), true);

    const handleLanguageChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      applyLanguage(isLocale(detail) ? detail : resolveLanguage(), false);
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_STORAGE_KEY) return;
      applyLanguage(isLocale(event.newValue) ? event.newValue : resolveLanguage(), true);
    };

    window.addEventListener('veinvite-language-change', handleLanguageChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('veinvite-language-change', handleLanguageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || 'https://veinvite.vercel.app';

  const allowedWallets = walletConnectProjectId
    ? ['veworld', 'wallet-connect']
    : ['veworld'];

  const dappKit: Record<string, unknown> = { allowedWallets };
  if (walletConnectProjectId) {
    dappKit.walletConnectOptions = {
      projectId: walletConnectProjectId,
      metadata: {
        name: 'VeInvite',
        description: 'Verified onboarding for the VeBetterDAO ecosystem.',
        url: appUrl,
        icons: [`${appUrl}/veinvite-logo.webp`],
      },
    };
  }

  /* Google/email embedded-wallet login remains intentionally disabled until
     smart-account owner verification is implemented and tested end-to-end. */
  const loginMethods = [
    { method: 'veworld' as const, gridColumn: 4 },
    ...(walletConnectProjectId
      ? [{ method: 'wallet-connect' as const, gridColumn: 4 }]
      : []),
  ];

  return (
    <QueryClientProvider client={queryClient}>
      <VeChainKitProvider
        language={language}
        dappKit={dappKit as never}
        loginMethods={loginMethods as never}
        darkMode
        network={{ type: (process.env.NEXT_PUBLIC_NETWORK_TYPE || 'main') as never }}
        theme={{ accent: '#f4b728' }}
      >
        {children}
      </VeChainKitProvider>
    </QueryClientProvider>
  );
}
