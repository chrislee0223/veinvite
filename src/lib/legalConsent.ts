export const CURRENT_TERMS_VERSION = 1;
// Privacy v2 adds the September 3, 2026 anonymous usage-analytics disclosure.
// Keep the privacy version independent from the Terms version so wallets that
// accepted the earlier privacy text are asked to review the materially updated
// document while their original consent record remains preserved.
export const CURRENT_PRIVACY_VERSION = 2;

export const LEGAL_CONSENT_INTENT =
  'ACCEPT_CURRENT_LEGAL_DOCUMENTS';

export const LEGACY_LEGAL_STORAGE_KEY =
  'vechain-kit-legal-documents';

export type LegalConsentSource =
  | 'ui'
  | 'legacy-local-storage';
