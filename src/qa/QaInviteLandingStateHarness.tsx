'use client';

import { InviteLandingV2 } from '@/components/InviteLandingV2';
import type { SupportedLocale } from '@/lib/i18n/locales';

export type QaInviteLandingStateId = 'PRI-LANDING-DISABLED';

export function QaInviteLandingStateHarness({
  stateId,
  locale,
}: {
  stateId: QaInviteLandingStateId;
  locale: SupportedLocale;
}) {
  return (
    <div data-qa-invite-landing-state={stateId}>
      <InviteLandingV2
        locale={locale}
        disabled
        demoMode={false}
        demoOutcome="success"
        onLocaleChange={() => {}}
        onBeginnerStart={() => {}}
        onExistingWallet={() => {}}
        onDemoOutcomeChange={() => {}}
      />
    </div>
  );
}
