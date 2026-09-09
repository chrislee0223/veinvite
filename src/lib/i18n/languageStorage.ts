import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  type SupportedLocale,
} from './locales';

export const PENDING_MANUAL_LANGUAGE_KEY =
  'veinvite.pendingManualLanguage';

export function readStoredLanguage(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredLanguage(language: SupportedLocale): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage can be unavailable in restricted in-app browsers. Language
    // selection must remain usable even when persistence is not available.
  }
}

export function markPendingManualLanguage(language: SupportedLocale): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(PENDING_MANUAL_LANGUAGE_KEY, language);
  } catch {
    // The authenticated wallet sync can still fall back to the displayed
    // language when session storage is unavailable.
  }
}

export function readPendingManualLanguage(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.sessionStorage.getItem(PENDING_MANUAL_LANGUAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingManualLanguage(language?: SupportedLocale): void {
  if (typeof window === 'undefined') return;

  try {
    if (language) {
      const current = window.sessionStorage.getItem(PENDING_MANUAL_LANGUAGE_KEY);
      if (current !== language) return;
    }
    window.sessionStorage.removeItem(PENDING_MANUAL_LANGUAGE_KEY);
  } catch {
    // Non-fatal by design.
  }
}
