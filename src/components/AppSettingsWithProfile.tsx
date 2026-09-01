'use client';

import { AppSettings } from './AppSettings';
import { PublicProfileSettings } from './PublicProfileSettings';
import type { Locale } from '@/lib/i18n/locales';

export function AppSettingsWithProfile({
  locale,
  wallet,
  isWalletActionPending,
  onLocaleChange,
  onConnect,
  onConnectAnother,
  onDisconnect,
}: {
  locale: Locale;
  wallet: string | null;
  isWalletActionPending: boolean;
  onLocaleChange: (locale: Locale) => void;
  onConnect: () => void;
  onConnectAnother: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  return (
    <>
      <AppSettings
        locale={locale}
        wallet={wallet}
        isWalletActionPending={isWalletActionPending}
        onLocaleChange={onLocaleChange}
        onConnect={onConnect}
        onConnectAnother={onConnectAnother}
        onDisconnect={onDisconnect}
      />
      <PublicProfileSettings locale={locale} wallet={wallet} />
    </>
  );
}
