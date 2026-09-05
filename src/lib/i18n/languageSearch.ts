import {
  LANGUAGE_OPTIONS,
  isLocale,
  type LanguageOption,
  type Locale,
  type SupportedLocale,
} from './locales';

export type LocalizedLanguageNames = Partial<
  Record<SupportedLocale, string>
>;

export function normalizeLanguageSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function buildLocalizedLanguageNames(
  locale: Locale,
): LocalizedLanguageNames {
  if (typeof Intl.DisplayNames !== 'function') {
    return {};
  }

  const displayLocale = isLocale(locale) ? locale : 'en';

  try {
    const displayNames = new Intl.DisplayNames(
      [displayLocale, 'en'],
      { type: 'language' },
    );
    const localizedNames: LocalizedLanguageNames = {};

    for (const option of LANGUAGE_OPTIONS) {
      try {
        const localizedName = displayNames.of(option.locale);
        if (localizedName) {
          localizedNames[option.locale] = localizedName;
        }
      } catch {
        // Keep the native/English/code fallbacks for tags whose localized
        // display name is not available in this browser's Intl data.
      }
    }

    return localizedNames;
  } catch {
    // Older WebViews can lack locale data even when Intl.DisplayNames exists.
    // Search must remain fully usable through the static fallback names.
    return {};
  }
}

export function matchesLanguageSearch(
  option: LanguageOption,
  normalizedQuery: string,
  localizedNames: LocalizedLanguageNames,
): boolean {
  if (!normalizedQuery) {
    return true;
  }

  return [
    option.nativeName,
    option.englishName,
    option.locale,
    localizedNames[option.locale] ?? '',
  ].some((value) =>
    normalizeLanguageSearch(value).includes(normalizedQuery),
  );
}
