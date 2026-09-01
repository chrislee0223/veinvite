export const CURRENT_TERMS_VERSION = 1;
export const CURRENT_PRIVACY_VERSION = 1;

export const LEGAL_CONSENT_INTENT =
  'ACCEPT_CURRENT_LEGAL_DOCUMENTS';

export const LEGACY_LEGAL_STORAGE_KEY =
  'vechain-kit-legal-documents';

export type LegalConsentSource =
  | 'ui'
  | 'legacy-local-storage';
