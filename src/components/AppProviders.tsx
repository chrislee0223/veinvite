'use client';

import type { ReactNode } from 'react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import dynamic from 'next/dynamic';

import '@/lib/i18n/copyHardening';
import { HeaderLanguagePickerPortal } from './HeaderLanguagePickerPortal';
import { LegalNavigationMemory } from './LegalNavigationMemory';
import { PublicRewardForecastPortal } from './PublicRewardForecastPortal';

const VeChainProvider = dynamic(
  () =>
    import('@/components/VeChainProvider').then(
      (mod) => mod.VeChainProvider,
    ),
  { ssr: false },
);

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
        {children}
        <LegalNavigationMemory />
        <HeaderLanguagePickerPortal />
        <PublicRewardForecastPortal />
      </VeChainProvider>
    </ChakraProvider>
  );
}
