'use client';

import type { ComponentProps } from 'react';

import { InviteLandingV2 as InviteLandingV2Legacy } from './InviteLandingV2Legacy';
import { isLocale, type SupportedLocale } from '@/lib/i18n/locales';

type LegacyProps = ComponentProps<typeof InviteLandingV2Legacy>;
type InviteLandingV2Props = Omit<LegacyProps, 'locale' | 'onLocaleChange'> & {
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
};

export function InviteLandingV2({
  locale,
  onLocaleChange,
  ...rest
}: InviteLandingV2Props) {
  return (
    <InviteLandingV2Legacy
      {...rest}
      locale={locale}
      onLocaleChange={(nextLocale) => {
        if (isLocale(nextLocale)) onLocaleChange(nextLocale);
      }}
    />
  );
}
