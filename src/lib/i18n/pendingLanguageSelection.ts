import {
  isLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';

const PENDING_MANUAL_LANGUAGE_STORAGE_KEY =
  'veinvite:pending-manual-language:v1';
const PENDING_MANUAL_LANGUAGE_TTL_MS =
  30 * 60_000;

type PendingManualLanguage = {
  language: SupportedLocale;
  createdAt: number;
};

export function markPendingManualLanguage(
  language: SupportedLocale,
): void {
  if (typeof window === 'undefined') return;

  try {
    const payload: PendingManualLanguage = {
      language,
      createdAt: Date.now(),
    };
    window.sessionStorage.setItem(
      PENDING_MANUAL_LANGUAGE_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Language selection must remain non-fatal in restricted WebViews.
  }
}

export function readPendingManualLanguage():
  | SupportedLocale
  | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(
      PENDING_MANUAL_LANGUAGE_STORAGE_KEY,
    );
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<
      PendingManualLanguage
    >;
    if (
      !isLocale(parsed.language) ||
      typeof parsed.createdAt !== 'number' ||
      !Number.isFinite(parsed.createdAt) ||
      Date.now() - parsed.createdAt < 0 ||
      Date.now() - parsed.createdAt >
        PENDING_MANUAL_LANGUAGE_TTL_MS
    ) {
      window.sessionStorage.removeItem(
        PENDING_MANUAL_LANGUAGE_STORAGE_KEY,
      );
      return null;
    }

    return parsed.language;
  } catch {
    return null;
  }
}

export function clearPendingManualLanguage(): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(
      PENDING_MANUAL_LANGUAGE_STORAGE_KEY,
    );
  } catch {
    // Non-fatal by design.
  }
}
