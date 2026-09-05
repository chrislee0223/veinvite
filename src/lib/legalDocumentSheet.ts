import type { SupportedLocale } from './i18n/locales';
import type { LegalDocumentKind } from './i18n/legalCopy';

export const LEGAL_DOCUMENT_SHEET_OPEN_EVENT =
  'veinvite-open-legal-document';

export type LegalDocumentReturnView =
  | 'home'
  | 'guide'
  | 'leaderboard'
  | 'settings';

export type LegalDocumentSheetOpenDetail = {
  kind: LegalDocumentKind;
  locale: SupportedLocale;
  returnView: LegalDocumentReturnView;
};
