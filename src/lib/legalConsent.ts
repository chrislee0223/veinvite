export const CURRENT_TERMS_VERSION = 1;
// Privacy v3 (September 6, 2026) updates the anonymous analytics retention
// disclosure: raw usage/product analytics may remain in the active database for
// up to 365 days and older raw analytics may move to a verified protected
// archive before active-database cleanup. Keep Privacy versioning independent
// from Terms so previously accepted wallets are asked to review this material
// data-retention change while their earlier consent records remain preserved.
export const CURRENT_PRIVACY_VERSION = 3;

export const LEGAL_CONSENT_INTENT =
  'ACCEPT_CURRENT_LEGAL_DOCUMENTS';

export const LEGACY_LEGAL_STORAGE_KEY =
  'vechain-kit-legal-documents';

export type LegalConsentSource =
  | 'ui'
  | 'legacy-local-storage';
