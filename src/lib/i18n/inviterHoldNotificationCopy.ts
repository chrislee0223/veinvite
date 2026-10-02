import type { SupportedLocale } from './locales';
import {
  INVITER_SECURITY_NOTIFICATION_COPY,
} from './inviterSecurityNotificationCopy';

export type InviterHoldNotificationCopy = {
  title: string;
  body: string;
};

// Inviter escalation HOLD is review-only. Keep this adapter tied to the
// reviewed inviter security copy so a notification-only refactor cannot
// accidentally describe HOLD as an access restriction again.
export const INVITER_HOLD_NOTIFICATION_COPY = Object.fromEntries(
  Object.entries(INVITER_SECURITY_NOTIFICATION_COPY).map(
    ([locale, copy]) => [
      locale,
      {
        title: copy.holdTitle,
        body: copy.holdBody,
      },
    ],
  ),
) as Record<SupportedLocale, InviterHoldNotificationCopy>;
