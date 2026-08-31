import { ENTRY_REJECTION_COPY } from './entryRejectionCopy';
import { INVITEE_COPY } from './inviteeCopy';
import type { Locale } from './locales';

// Keep user-facing rejection feedback useful without exposing the exact
// reward/voting evidence or timing rules used by the eligibility engine.
// Detailed evidence remains server-side for audit and abuse investigation.
for (const locale of Object.keys(ENTRY_REJECTION_COPY) as Locale[]) {
  const rejection = ENTRY_REJECTION_COPY[locale];
  INVITEE_COPY[locale].errors.existing = rejection.title;
  INVITEE_COPY[locale].existingHelp =
    `${rejection.reasonLabel}: ${rejection.reason} ${rejection.help}`;
}
