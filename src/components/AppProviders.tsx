'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import dynamic from 'next/dynamic';

// Register every supported locale before shared copy hardening runs. Some
// hardening passes intentionally iterate the dictionaries that exist at import
// time, so this order keeps newly added locale packs inside those safeguards.
import '@/lib/i18n/localePacks/registerExpandedLocales';
import '@/lib/i18n/inviteLandingFinalPolish';
import '@/lib/i18n/copyHardening';
import '@/lib/i18n/inviteeMissionCopyPolish';
import '@/lib/i18n/inviteeConversionPolicyPolish';
import '@/lib/i18n/guideCopyFinalHardening';
import '@/lib/i18n/guideNaturalnessPolish';
import '@/lib/i18n/guideVot3PolicyPolish';
import '@/lib/i18n/secondaryPageCopyHardening';
import '@/lib/i18n/referralLinkCopy';
import '@/lib/i18n/referralLinkCopyFinalHardening';
import '@/lib/i18n/guideRewardClaimHardening';
import { DeferredStartupExtras } from './DeferredStartupExtras';
import { HeaderLanguagePickerPortal } from './HeaderLanguagePickerPortal';
import { InviteFlowVisualPolish } from './InviteFlowVisualPolish';
import { LegalNavigationMemory } from './LegalNavigationMemory';
import { SecondaryPageLayoutPolish } from './SecondaryPageLayoutPolish';
import { WalletConnectionResume } from './WalletConnectionResume';
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
        <WalletConnectionResume />
        <WalletRuntimeLifecycle />
        {children}
        <WalletLanguagePreferenceSync />
        <SecondaryPageLayoutPolish />
        <LegalNavigationMemory />
        <InviteFlowVisualPolish />
        <HeaderLanguagePickerPortal />
        <DeferredStartupExtras />
      </VeChainProvider>
    </ChakraProvider>
  );
}
