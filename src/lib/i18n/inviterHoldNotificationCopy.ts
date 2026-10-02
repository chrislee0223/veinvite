import type { SupportedLocale } from './locales';
import { INVITER_SECURITY_NOTIFICATION_COPY } from './inviterSecurityNotificationCopy';

export type InviterHoldNotificationCopy = {
  title: string;
  body: string;
};

export const INVITER_HOLD_NOTIFICATION_COPY: Record<
  SupportedLocale,
  InviterHoldNotificationCopy
> = Object.fromEntries(
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
