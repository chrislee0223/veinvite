'use client';

import { useState } from 'react';

import { InviteLandingV2 } from './InviteLandingV2';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';

export function InviteEntryVisualPreview() {
  const [locale, setLocale] = useState<Locale>('ko');

  return (
    <InviteLandingV2
      locale={locale}
      demoOutcome="success"
      onLocaleChange={(nextLocale: SupportedLocale) => setLocale(nextLocale)}
      onBeginnerStart={() => undefined}
      onExistingWallet={() => undefined}
      onDemoOutcomeChange={() => undefined}
    />
  );
}
