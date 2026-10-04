'use client';

import { useState } from 'react';

import { countryFlagAssetUrl } from '@/lib/countryCodes';
import {
  getLanguageOption,
  type SupportedLocale,
} from '@/lib/i18n/locales';

type LanguageFlagProps = {
  locale: SupportedLocale;
};

export function LanguageFlag({ locale }: LanguageFlagProps) {
  const language = getLanguageOption(locale);
  const primarySource = countryFlagAssetUrl(
    language.flagCountryCode,
  );
  const [failedPrimarySource, setFailedPrimarySource] =
    useState<string | null>(null);
  const source =
    failedPrimarySource === primarySource
      ? language.flagSource
      : primarySource;

  return (
    <img
      className="flagSvg"
      src={source}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (failedPrimarySource !== primarySource) {
          setFailedPrimarySource(primarySource);
        }
      }}
    />
  );
}
