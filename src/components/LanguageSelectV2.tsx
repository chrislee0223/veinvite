'use client';

import type { ComponentProps } from 'react';

import { LanguageSelectV2 as LanguageSelectV2Legacy } from './LanguageSelectV2Legacy';
import { isLocale, type SupportedLocale } from '@/lib/i18n/locales';

type LegacyProps = ComponentProps<typeof LanguageSelectV2Legacy>;
type LanguageSelectV2Props = Omit<LegacyProps, 'locale' | 'onSelect'> & {
  locale: SupportedLocale;
  onSelect: (locale: SupportedLocale) => void;
};

export function LanguageSelectV2({
  locale,
  onSelect,
  ...rest
}: LanguageSelectV2Props) {
  return (
    <LanguageSelectV2Legacy
      {...rest}
      locale={locale}
      onSelect={(nextLocale) => {
        if (isLocale(nextLocale)) onSelect(nextLocale);
      }}
    />
  );
}
