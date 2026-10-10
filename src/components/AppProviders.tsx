'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

// One reviewed side-effect entrypoint owns locale registration and copy-patch order.
import '@/lib/i18n/runtimePatches';
import { LeaderboardMovementColorPolish } from './LeaderboardMovementColorPolish';
import { LegalDocumentSheetHost } from './LegalDocumentSheetHost';
import { LegalNavigationMemory } from './LegalNavigationMemory';
import { NetworkIdleWarmup } from './NetworkIdleWarmup';
import { RewardReservationRecovery } from './RewardReservationRecovery';
import { RuntimeVersionGuard } from './RuntimeVersionGuard';
import { RouteScopedInviteEnhancements } from './RouteScopedInviteEnhancements';
import { SecondaryPageLayoutPolish } from './SecondaryPageLayoutPolish';
import { StartupHydrationPlaceholders } from './StartupHydrationPlaceholders';
import { WalletConnectionResume } from './WalletConnectionResume';
import { WalletCountryObservationSync } from './WalletCountryObservationSync';
import { WalletLanguagePreferenceSync } from './WalletLanguagePreferenceSync';
import { WalletProviderAccountReconciler } from './WalletProviderAccountReconciler';
import { WalletRuntimeLifecycle } from './WalletRuntimeLifecycle';
import { WalletSessionTransitionShield } from './WalletSessionTransitionShield';

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

const NETWORK_SLOT_VISUAL_QA_PATH = '/qa/network-slot-visual';
const NOTIFICATION_LAYOUT_QA_PATH = '/qa/notification-state';

export function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === NETWORK_SLOT_VISUAL_QA_PATH || pathname === NOTIFICATION_LAYOUT_QA_PATH) {
    return (
      <ChakraProvider theme={theme}>
        {children}
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider theme={theme}>
      <VeChainProvider>
        <ProviderReadySignal />
        <RuntimeVersionGuard />
        <LegalDocumentSheetHost />
        <StartupHydrationPlaceholders />
        <WalletSessionTransitionShield />
        <WalletProviderAccountReconciler />
        <WalletConnectionResume />
        <WalletRuntimeLifecycle />
        <RewardReservationRecovery />
        {/* These listeners must mount before WalletSessionGate inside children.
            They no longer probe protected APIs before authentication; instead
            they wait for the authoritative wallet-session-ready/app-ready
            signal and therefore must be listening before that signal fires. */}
        <WalletLanguagePreferenceSync />
        <WalletCountryObservationSync />
        <NetworkIdleWarmup />
        {children}
        <SecondaryPageLayoutPolish />
        <LeaderboardMovementColorPolish />
        <LegalNavigationMemory />
        <RouteScopedInviteEnhancements />
      </VeChainProvider>
    </ChakraProvider>
  );
}
