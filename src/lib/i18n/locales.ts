export type LocaleDirection = 'ltr' | 'rtl';
export type LocaleTypography = 'latin' | 'cjk' | 'arabic' | 'indic';

export type LocaleDefinition = {
  locale: string;
  nativeName: string;
  flagSource: string;
  direction: LocaleDirection;
  typography: LocaleTypography;
};

// Single source of truth for every locale shown by VeInvite.
// Adding a language should start here: code, native name, app-owned flag,
// writing direction, and typography group. The typography group lets layout
// safeguards follow a script family instead of hard-coding every locale into
// CSS as the language list grows.
export const LOCALE_DEFINITIONS = [
  { locale: 'en', nativeName: 'English', flagSource: '/flags/us.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'ko', nativeName: '한국어', flagSource: '/flags/kr.svg', direction: 'ltr', typography: 'cjk' },
  { locale: 'zh', nativeName: '简体中文', flagSource: '/flags/cn.svg', direction: 'ltr', typography: 'cjk' },
  { locale: 'hi', nativeName: 'हिन्दी', flagSource: '/flags/in.svg', direction: 'ltr', typography: 'indic' },
  { locale: 'es', nativeName: 'Español', flagSource: '/flags/es.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'ja', nativeName: '日本語', flagSource: '/flags/jp.svg', direction: 'ltr', typography: 'cjk' },
  { locale: 'it', nativeName: 'Italiano', flagSource: '/flags/it.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'tr', nativeName: 'Türkçe', flagSource: '/flags/tr.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'nl', nativeName: 'Nederlands', flagSource: '/flags/nl.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'de', nativeName: 'Deutsch', flagSource: '/flags/de.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'fr', nativeName: 'Français', flagSource: '/flags/fr.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'ar', nativeName: 'العربية', flagSource: '/flags/ae.svg', direction: 'rtl', typography: 'arabic' },
  { locale: 'bn', nativeName: 'বাংলা', flagSource: '/flags/bd.svg', direction: 'ltr', typography: 'indic' },
  { locale: 'pt', nativeName: 'Português', flagSource: '/flags/br.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'ru', nativeName: 'Русский', flagSource: '/flags/ru.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'id', nativeName: 'Bahasa Indonesia', flagSource: '/flags/id.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'vi', nativeName: 'Tiếng Việt', flagSource: '/flags/vn.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'zh-tw', nativeName: '繁體中文（台灣）', flagSource: '/flags/tw.svg', direction: 'ltr', typography: 'cjk' },
  { locale: 'sv', nativeName: 'Svenska', flagSource: '/flags/se.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'ro', nativeName: 'Română', flagSource: '/flags/ro.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'ur', nativeName: 'اردو', flagSource: '/flags/pk.svg', direction: 'rtl', typography: 'arabic' },
  { locale: 'pcm', nativeName: 'Nigerian Pidgin', flagSource: '/flags/ng.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'arz', nativeName: 'العربية المصرية', flagSource: '/flags/eg.svg', direction: 'rtl', typography: 'arabic' },
  { locale: 'mr', nativeName: 'मराठी', flagSource: '/flags/in.svg', direction: 'ltr', typography: 'indic' },
  { locale: 'te', nativeName: 'తెలుగు', flagSource: '/flags/in.svg', direction: 'ltr', typography: 'indic' },
  { locale: 'sw', nativeName: 'Kiswahili', flagSource: '/flags/ke.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'ha', nativeName: 'Hausa', flagSource: '/flags/ng.svg', direction: 'ltr', typography: 'latin' },
  { locale: 'el', nativeName: 'Ελληνικά', flagSource: '/flags/gr.svg', direction: 'ltr', typography: 'latin' },
] as const satisfies readonly LocaleDefinition[];

export const SUPPORTED_LOCALES = LOCALE_DEFINITIONS.map(
  (definition) => definition.locale,
);

export type SupportedLocale =
  (typeof LOCALE_DEFINITIONS)[number]['locale'];

/**
 * @deprecated Legacy translation tables still use string-keyed records while
 * expanded locale packs are registered at runtime. New user-facing state,
 * component props, selectors, and APIs should use SupportedLocale instead.
 */
export type Locale = string;

export const LANGUAGE_STORAGE_KEY =
  'veinvite-language';

export type LanguageOption = {
  locale: SupportedLocale;
  nativeName: string;
  flagSource: string;
  direction: LocaleDirection;
  typography: LocaleTypography;
};

export const LANGUAGE_OPTIONS: LanguageOption[] =
  LOCALE_DEFINITIONS.map((definition) => ({
    locale: definition.locale,
    nativeName: definition.nativeName,
    flagSource: definition.flagSource,
    direction: definition.direction,
    typography: definition.typography,
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
    .replaceAll('_', '-');

  if (!normalized) {
    return null;
  }

  // Prefer an explicitly supported locale tag (for example zh-tw) before
  // falling back to its base language.
  if (isLocale(normalized)) {
    return normalized;
  }

  // Some browsers expose Traditional Chinese by script instead of region,
  // e.g. zh-Hant or zh-Hant-TW. Treat the Hant script as the reviewed Taiwan
  // Traditional Chinese experience rather than accidentally falling through
  // to Simplified Chinese via the base `zh` locale.
  if (
    normalized === 'zh-hant' ||
    normalized.startsWith('zh-hant-')
  ) {
    return 'zh-tw';
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

export function getLocaleTypography(
  locale: string,
): LocaleTypography {
  return getLanguageOption(locale).typography;
}

export function isRtlLocale(
  locale: string,
): boolean {
  return getLocaleDirection(locale) === 'rtl';
}

export function isCjkLocale(
  locale: string,
): boolean {
  return getLocaleTypography(locale) === 'cjk';
}
