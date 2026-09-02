'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import dynamic from 'next/dynamic';

import '@/lib/i18n/copyHardening';
import '@/lib/i18n/secondaryPageCopyHardening';
import { HeaderLanguagePickerPortal } from './HeaderLanguagePickerPortal';
import { LegalNavigationMemory } from './LegalNavigationMemory';
import { PublicRewardForecastPortal } from './PublicRewardForecastPortal';
import { SecondaryPageLayoutPolish } from './SecondaryPageLayoutPolish';
import { WalletLanguagePreferenceSync } from './WalletLanguagePreferenceSync';
import { WalletRuntimeLifecycle } from './WalletRuntimeLifecycle';

const VeChainProvider = dynamic(
  () =>
    import('@/components/VeChainProvider').then(
      (mod) => mod.VeChainProvider,
    ),
  { ssr: false },
);

const PROVIDER_READY_EVENT =
  'veinvite-provider-ready';

function ProviderReadySignal() {
  useEffect(() => {
    document.documentElement.dataset.veinviteProviderReady =
      'true';
    window.dispatchEvent(
      new Event(PROVIDER_READY_EVENT),
    );

    return () => {
      delete document.documentElement.dataset
        .veinviteProviderReady;
    };
  }, []);

  return null;
}

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
  styles: {
    global: {
      body: {
        bg: '#080807',
        color: '#f8f6ef',
      },
    },
  },
});

export function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ChakraProvider theme={theme}>
      <VeChainProvider>
        <ProviderReadySignal />
        <WalletRuntimeLifecycle />
        {children}
        <WalletLanguagePreferenceSync />
        <SecondaryPageLayoutPolish />
        <LegalNavigationMemory />
        <HeaderLanguagePickerPortal />
        <PublicRewardForecastPortal />
      </VeChainProvider>
    </ChakraProvider>
  );
}
