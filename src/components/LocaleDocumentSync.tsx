'use client';

import { useEffect } from 'react';

import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  resolveBrowserLocale,
  type Locale,
} from '@/lib/i18n/locales';

function resolveCurrentLocale(): Locale {
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isLocale(saved)) return saved;
  return resolveBrowserLocale(window.navigator.languages, 'en');
}

export function LocaleDocumentSync() {
  useEffect(() => {
    const applyLocale = (value?: unknown) => {
      const nextLocale = isLocale(value)
        ? value
        : resolveCurrentLocale();
      document.documentElement.lang = nextLocale;
    };

    applyLocale();

    const handleLanguageChange = (event: Event) => {
      applyLocale((event as CustomEvent<unknown>).detail);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_STORAGE_KEY) return;
      applyLocale(event.newValue);
    };

    window.addEventListener('veinvite-language-change', handleLanguageChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('veinvite-language-change', handleLanguageChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return null;
}
