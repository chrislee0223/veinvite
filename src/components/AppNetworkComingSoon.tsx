'use client';

import { AppNetwork } from './AppNetwork';
import { useWalletLauncher } from './WalletControl';
import type { Locale } from '@/lib/i18n/locales';

// The public tab still uses the legacy `guide` key so existing analytics and
// persisted navigation contracts remain stable. Keep this compatibility wrapper
// until that internal key is migrated separately; the user-facing surface is
// now the live Network experience.
export function AppNetworkComingSoon({ locale }: { locale: Locale }) {
  const { wallet, openWallet } = useWalletLauncher();

  const openInviteHome = () => {
    const homeTab = document.querySelector<HTMLButtonElement>(
      '[data-veinvite-tab="home"]',
    );
    if (homeTab) {
      homeTab.click();
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AppNetwork
      locale={locale}
      wallet={wallet}
      onConnect={openWallet}
      onInvite={openInviteHome}
    />
  );
}
