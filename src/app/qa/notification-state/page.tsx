import { notFound } from 'next/navigation';

import { QaNotificationStateHarness, type QaNotificationStateId } from '@/qa/QaNotificationStateHarness';
import { isLocale } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

// Protected by the existing /qa/layout access policy. Render the real
// production notification component without booting wallet/chain providers.
// This isolates translated UI layout QA from unrelated wallet initialization.
const QA_NOTIFICATION_STATES = new Set<QaNotificationStateId>([
  'NOTI-HISTORY-OPEN',
  'NOTI-REFERRAL-RESTORED',
  'NOTI-POST-PAYOUT-REVIEW',
  'NOTI-REWARD-PAID',
  'NOTI-REFERRAL-INVALIDATED',
  'NOTI-REWARD-ADJUSTED',
  'NOTI-SECURITY-CLEARED',
]);

export default async function NotificationLocaleStatePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; locale?: string }>;
}) {
  const { state, locale } = await searchParams;
  if (!state || !QA_NOTIFICATION_STATES.has(state as QaNotificationStateId)) {
    notFound();
  }

  return (
    <QaNotificationStateHarness
      stateId={state as QaNotificationStateId}
      locale={isLocale(locale) ? locale : 'en'}
    />
  );
}
