export type LocaleDirection = 'ltr' | 'rtl';

export type LocaleDefinition = {
  locale: string;
  nativeName: string;
  flagSource: string;
  direction: LocaleDirection;
  cjk?: boolean;
};

// Single source of truth for every locale shown by VeInvite.
// Adding a language should start here: code, native name, app-owned flag,
// writing direction, and (when relevant) CJK line-breaking behavior.
export const LOCALE_DEFINITIONS = [
  { locale: 'en', nativeName: 'English', flagSource: '/flags/us.svg', direction: 'ltr' },
  { locale: 'ko', nativeName: '한국어', flagSource: '/flags/kr.svg', direction: 'ltr', cjk: true },
  { locale: 'zh', nativeName: '简体中文', flagSource: '/flags/cn.svg', direction: 'ltr', cjk: true },
  { locale: 'hi', nativeName: 'हिन्दी', flagSource: '/flags/in.svg', direction: 'ltr' },
  { locale: 'es', nativeName: 'Español', flagSource: '/flags/es.svg', direction: 'ltr' },
  { locale: 'ja', nativeName: '日本語', flagSource: '/flags/jp.svg', direction: 'ltr', cjk: true },
  { locale: 'it', nativeName: 'Italiano', flagSource: '/flags/it.svg', direction: 'ltr' },
  { locale: 'tr', nativeName: 'Türkçe', flagSource: '/flags/tr.svg', direction: 'ltr' },
  { locale: 'nl', nativeName: 'Nederlands', flagSource: '/flags/nl.svg', direction: 'ltr' },
  { locale: 'de', nativeName: 'Deutsch', flagSource: '/flags/de.svg', direction: 'ltr' },
  { locale: 'fr', nativeName: 'Français', flagSource: '/flags/fr.svg', direction: 'ltr' },
  { locale: 'ar', nativeName: 'العربية', flagSource: '/flags/ae.svg', direction: 'rtl' },
  { locale: 'bn', nativeName: 'বাংলা', flagSource: '/flags/bd.svg', direction: 'ltr' },
  { locale: 'pt', nativeName: 'Português', flagSource: '/flags/br.svg', direction: 'ltr' },
  { locale: 'ru', nativeName: 'Русский', flagSource: '/flags/ru.svg', direction: 'ltr' },
  { locale: 'id', nativeName: 'Bahasa Indonesia', flagSource: '/flags/id.svg', direction: 'ltr' },
  { locale: 'vi', nativeName: 'Tiếng Việt', flagSource: '/flags/vn.svg', direction: 'ltr' },
] as const satisfies readonly LocaleDefinition[];

export const SUPPORTED_LOCALES = LOCALE_DEFINITIONS.map(
  (definition) => definition.locale,
);

export type SupportedLocale =
  (typeof LOCALE_DEFINITIONS)[number]['locale'];

// Older copy modules use Record<Locale, CopyShape>. Keeping Locale string-like
// lets the existing translations remain isolated while new locale packs are
// registered centrally. Runtime safety is enforced by isLocale() plus the
// i18n completeness audit, which checks every supported locale and copy surface.
export type Locale = string;

export const LANGUAGE_STORAGE_KEY =
  'veinvite-language';

export type LanguageOption = {
  locale: SupportedLocale;
  nativeName: string;
  flagSource: string;
  direction: LocaleDirection;
};

export const LANGUAGE_OPTIONS: LanguageOption[] =
  LOCALE_DEFINITIONS.map((definition) => ({
    locale: definition.locale,
    nativeName: definition.nativeName,
    flagSource: definition.flagSource,
    direction: definition.direction,
  }));

const SUPPORTED_LOCALE_SET =
  new Set<string>(SUPPORTED_LOCALES);

export function isLocale(
  value: unknown,
): value is SupportedLocale {
  return (
    typeof value === 'string' &&
    SUPPORTED_LOCALE_SET.has(value)
  );
}

export function localeFromLanguageTag(
  value: string | null | undefined,
): SupportedLocale | null {
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
  fallback: SupportedLocale = 'en',
): SupportedLocale {
  for (const language of languages ?? []) {
    const locale = localeFromLanguageTag(language);

    if (locale) {
      return locale;
    }
  }

  return fallback;
}

export function getLanguageOption(
  locale: string,
): LanguageOption {
  return (
    LANGUAGE_OPTIONS.find(
      (option) => option.locale === locale,
    ) ?? LANGUAGE_OPTIONS[0]
  );
}

export function getLocaleDirection(
  locale: string,
): LocaleDirection {
  return getLanguageOption(locale).direction;
}

export function isRtlLocale(
  locale: string,
): boolean {
  return getLocaleDirection(locale) === 'rtl';
}

export function isCjkLocale(
  locale: string,
): boolean {
  return LOCALE_DEFINITIONS.some(
    (definition) =>
      definition.locale === locale &&
      'cjk' in definition &&
      definition.cjk === true,
  );
}
