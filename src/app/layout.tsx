'use client';

import type { ReactNode } from 'react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import './globals.css';

const VeChainProvider = dynamic(
  () => import('@/components/VeChainProvider').then((mod) => mod.VeChainProvider),
  { ssr: false },
);

const theme = extendTheme({
  config: { initialColorMode: 'dark', useSystemColorMode: false },
  styles: { global: { body: { bg: '#070912', color: '#f8f7ff' } } },
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <ChakraProvider theme={theme}>
          <VeChainProvider>{children}</VeChainProvider>
        </ChakraProvider>
      </body>
    </html>
  );
}
