'use client';

import type { ReactNode } from 'react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVeChainKitConfig } from '@vechain/vechain-kit';

import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  resolveBrowserLocale,
  type Locale,
} from '@/lib/i18n/locales';

const VeChainKitProvider = dynamic(
  () =>
    import('@vechain/vechain-kit').then(
      (mod) => mod.VeChainKitProvider,
    ),
  { ssr: false },
);

// These are the VeInvite locales already exercised with VeChain Kit. VeInvite
// may support additional app-only locales; those safely keep the wallet modal
// in English rather than passing an unknown language into the live provider.
const VECHAIN_KIT_LANGUAGES = new Set<string>([
  'en',
  'ko',
  'zh',
  'hi',
  'es',
  'ja',
  'it',
  'tr',
  'nl',
  'de',
  'fr',
]);

function resolveVeChainKitLanguage(
  locale: string,
): string {
  return VECHAIN_KIT_LANGUAGES.has(locale)
    ? locale
    : 'en';
}

function resolveVeInviteLanguage(): Locale {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = window.localStorage.getItem(
    LANGUAGE_STORAGE_KEY,
  );

  if (isLocale(saved)) {
    return saved;
  }

  return resolveBrowserLocale(
    window.navigator.languages,
    'en',
  );
}

function VeChainLanguageSync() {
  const {
    currentLanguage,
    setLanguage: setKitLanguage,
  } = useVeChainKitConfig();

  useEffect(() => {
    const syncLanguage = (nextLanguage: Locale) => {
      const kitLanguage =
        resolveVeChainKitLanguage(nextLanguage);

      if (currentLanguage !== kitLanguage) {
        setKitLanguage(kitLanguage as never);
      }
    };

    syncLanguage(resolveVeInviteLanguage());

    const handleLanguageChange = (event: Event) => {
      const detail =
        (event as CustomEvent<unknown>).detail;

      if (isLocale(detail)) {
        syncLanguage(detail);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_STORAGE_KEY) {
        return;
      }

      syncLanguage(
        isLocale(event.newValue)
          ? event.newValue
          : resolveVeInviteLanguage(),
      );
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
  }, [currentLanguage, setKitLanguage]);

  return null;
}

export function VeChainProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () => new QueryClient(),
  );
  const [initialLanguage] = useState(
    () =>
      resolveVeChainKitLanguage(
        resolveVeInviteLanguage(),
      ),
  );
  const walletConnectProjectId =
    process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

  // Keep the wallet-provider configuration referentially stable. VeInvite
  // language changes are synchronized through VeChain Kit's supported runtime
  // setLanguage API below instead of rebuilding the provider configuration.
  // This prevents a settings-only locale change from disturbing the active
  // VeWorld / WalletConnect account and forcing a fresh wallet proof.
  const appUrl = useMemo(
    () =>
      typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL ||
          'https://veinvite.vercel.app',
    [],
  );

  const dappKit = useMemo(() => {
    const allowedWallets = walletConnectProjectId
      ? ['veworld', 'wallet-connect']
      : ['veworld'];
    const config: Record<string, unknown> = {
      allowedWallets,
    };

    if (walletConnectProjectId) {
      config.walletConnectOptions = {
        projectId: walletConnectProjectId,
        metadata: {
          name: 'VeInvite',
          description:
            'Verified onboarding for the VeBetterDAO ecosystem.',
          url: appUrl,
          icons: [`${appUrl}/veinvite-logo.webp`],
        },
      };
    }

    return config;
  }, [appUrl, walletConnectProjectId]);

  const loginMethods = useMemo(
    () => [
      {
        method: 'veworld' as const,
        gridColumn: 4,
      },
      ...(walletConnectProjectId
        ? [
            {
              method: 'wallet-connect' as const,
              gridColumn: 4,
            },
          ]
        : []),
    ],
    [walletConnectProjectId],
  );

  const network = useMemo(
    () => ({
      type: (process.env.NEXT_PUBLIC_NETWORK_TYPE ||
        'main') as never,
    }),
    [],
  );

  const theme = useMemo(
    () => ({ accent: '#f4b728' }),
    [],
  );

  /* Google/email embedded-wallet login remains intentionally disabled until
     smart-account owner verification is implemented and tested end-to-end. */

  return (
    <QueryClientProvider client={queryClient}>
      <VeChainKitProvider
        language={initialLanguage as never}
        dappKit={dappKit as never}
        loginMethods={loginMethods as never}
        darkMode
        network={network}
        theme={theme}
      >
        <VeChainLanguageSync />
        {children}
      </VeChainKitProvider>
    </QueryClientProvider>
  );
}
