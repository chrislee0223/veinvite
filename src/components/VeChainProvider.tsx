'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

const VeChainKitProvider = dynamic(
  () =>
    import('@vechain/vechain-kit').then(
      (mod) => mod.VeChainKitProvider,
    ),
  { ssr: false },
);

type Locale = 'ko' | 'en';

const LANGUAGE_STORAGE_KEY =
  'veinvite-language';

export function VeChainProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () => new QueryClient(),
  );

  const walletConnectProjectId =
    process.env
      .NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

  const [language, setLanguage] =
    useState<Locale>('en');

  useEffect(() => {
    const resolveLanguage =
      (): Locale => {
        const saved =
          window.localStorage.getItem(
            LANGUAGE_STORAGE_KEY,
          );

        if (
          saved === 'ko' ||
          saved === 'en'
        ) {
          return saved;
        }

        return window.navigator.language
          .toLowerCase()
          .startsWith('ko')
          ? 'ko'
          : 'en';
      };

    setLanguage(resolveLanguage());

    const handleLanguageChange = (
      event: Event,
    ) => {
      const customEvent =
        event as CustomEvent<Locale>;

      if (
        customEvent.detail === 'ko' ||
        customEvent.detail === 'en'
      ) {
        setLanguage(
          customEvent.detail,
        );
      } else {
        setLanguage(
          resolveLanguage(),
        );
      }
    };

    const handleStorageChange = (
      event: StorageEvent,
    ) => {
      if (
        event.key !==
        LANGUAGE_STORAGE_KEY
      ) {
        return;
      }

      if (
        event.newValue === 'ko' ||
        event.newValue === 'en'
      ) {
        setLanguage(
          event.newValue,
        );
      }
    };

    window.addEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );
    window.addEventListener(
      'storage',
      handleStorageChange,
    );

    return () => {
      window.removeEventListener(
        'veinvite-language-change',
        handleLanguageChange,
      );
      window.removeEventListener(
        'storage',
        handleStorageChange,
      );
    };
  }, []);

  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env
          .NEXT_PUBLIC_APP_URL ||
        'https://veinvite.vercel.app';

  const allowedWallets =
    walletConnectProjectId
      ? [
          'veworld',
          'wallet-connect',
        ]
      : ['veworld'];

  const dappKit:
    Record<string, unknown> = {
      allowedWallets,
    };

  if (walletConnectProjectId) {
    dappKit.walletConnectOptions = {
      projectId:
        walletConnectProjectId,
      metadata: {
        name: 'VeInvite',
        description:
          'Verified onboarding for the VeBetterDAO ecosystem.',
        url: appUrl,
        icons: [
          `${appUrl}/veinvite-logo.webp`,
        ],
      },
    };
  }

  /*
   * Google/email embedded-wallet login remains intentionally disabled.
   * VeInvite's current server proof validates an EOA signature. A social
   * smart account must not be treated as owned until the official smart-
   * account owner-verification path is implemented and tested end-to-end.
   */
  const loginMethods = [
    {
      method: 'veworld' as const,
      gridColumn: 4,
    },
    ...(walletConnectProjectId
      ? [
          {
            method:
              'wallet-connect' as const,
            gridColumn: 4,
          },
        ]
      : []),
  ];

  return (
    <QueryClientProvider
      client={queryClient}
    >
      <VeChainKitProvider
        language={language}
        dappKit={dappKit as never}
        loginMethods={
          loginMethods as never
        }
        darkMode
        network={{
          type: (
            process.env
              .NEXT_PUBLIC_NETWORK_TYPE ||
            'main'
          ) as never,
        }}
        theme={{
          accent: '#f4b728',
        }}
        legalDocuments={{
          termsAndConditions: [
            {
              url: `${appUrl}/terms`,
              version: 1,
              required: true,
              displayName:
                'VeInvite Terms',
            },
          ],
          privacyPolicy: [
            {
              url: `${appUrl}/privacy`,
              version: 1,
              required: true,
              displayName:
                'VeInvite Privacy',
            },
          ],
        }}
      >
        {children}
      </VeChainKitProvider>
    </QueryClientProvider>
  );
}
