'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV45 } from './AppNetworkCanaryV45';
import { AppNetworkHub as AppNetworkHubLegacy } from './AppNetworkHubLegacy';
import { useWalletLauncher } from './WalletControl';

const NETWORK_CANARY_WALLET = '0xeff325935b63299e9eeda79931bed6ec119aefcb';

export function AppNetworkHub({ locale }: { locale: Locale }) {
  const { wallet } = useWalletLauncher();
  const current = wallet?.toLowerCase() ?? '';

  if (current === NETWORK_CANARY_WALLET) {
    return <AppNetworkCanaryV45 locale={locale} />;
  }

  return <AppNetworkHubLegacy locale={locale} />;
}
