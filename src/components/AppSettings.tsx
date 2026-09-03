'use client';

import type { ComponentProps } from 'react';

import { AppSettings as AppSettingsLegacy } from './AppSettingsLegacy';
import { isLocale, type SupportedLocale } from '@/lib/i18n/locales';

type LegacyProps = ComponentProps<typeof AppSettingsLegacy>;
type AppSettingsProps = Omit<LegacyProps, 'locale' | 'onLocaleChange'> & {
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
};

export function AppSettings({
  locale,
  onLocaleChange,
  ...rest
}: AppSettingsProps) {
  return (
    <AppSettingsLegacy
      {...rest}
      locale={locale}
      onLocaleChange={(nextLocale) => {
        if (isLocale(nextLocale)) onLocaleChange(nextLocale);
      }}
    />
  );
}
