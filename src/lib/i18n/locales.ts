export const SUPPORTED_LOCALES = [
  'en',
  'ko',
  'zh',
  'hi',
  'es',
  'ja',
  'it',
  'tr',
  'nl',
  'de',
  'fr',
] as const;

export type Locale =
  (typeof SUPPORTED_LOCALES)[number];

export const LANGUAGE_STORAGE_KEY =
  'veinvite-language';

export type LanguageOption = {
  locale: Locale;
  nativeName: string;
};

// Country flags are rendered exclusively through the app-owned LanguageFlag
// SVG component. Keeping emoji metadata here would make it too easy for a
// future picker to accidentally fall back to platform-dependent flag artwork.
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { locale: 'en', nativeName: 'English' },
  { locale: 'ko', nativeName: '한국어' },
  { locale: 'zh', nativeName: '简体中文' },
  { locale: 'hi', nativeName: 'हिन्दी' },
  { locale: 'es', nativeName: 'Español' },
  { locale: 'ja', nativeName: '日本語' },
  { locale: 'it', nativeName: 'Italiano' },
  { locale: 'tr', nativeName: 'Türkçe' },
  { locale: 'nl', nativeName: 'Nederlands' },
  { locale: 'de', nativeName: 'Deutsch' },
  { locale: 'fr', nativeName: 'Français' },
];

const SUPPORTED_LOCALE_SET =
  new Set<string>(SUPPORTED_LOCALES);

export function isLocale(
  value: unknown,
): value is Locale {
  return (
    typeof value === 'string' &&
    SUPPORTED_LOCALE_SET.has(value)
  );
}

export function localeFromLanguageTag(
  value: string | null | undefined,
): Locale | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace('_', '-');

  if (!normalized) {
    return null;
  }

  const base = normalized.split('-')[0];

  if (base && isLocale(base)) {
    return base;
  }

  return null;
}

export function resolveBrowserLocale(
  languages: readonly string[] | undefined,
  fallback: Locale = 'en',
): Locale {
  for (const language of languages ?? []) {
    const locale = localeFromLanguageTag(language);

    if (locale) {
      return locale;
    }
  }

  return fallback;
}

export function getLanguageOption(
  locale: Locale,
): LanguageOption {
  return (
    LANGUAGE_OPTIONS.find(
      (option) => option.locale === locale,
    ) ?? LANGUAGE_OPTIONS[0]
  );
}

export function isCjkLocale(
  locale: Locale,
): boolean {
  return (
    locale === 'ko' ||
    locale === 'zh' ||
    locale === 'ja'
  );
}
