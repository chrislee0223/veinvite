'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkHub } from './AppNetworkHub';
import { NetworkReleasePresentation } from './NetworkReleasePresentation';

// V71 is now a release canary for the real API-backed Network surface.
// The QA radial playground remains available through its QA routes/files, but
// it is no longer mounted for the production canary wallet. This keeps canary
// verification representative of what general users will receive at launch.
export function AppNetworkCanaryV71({ locale }: { locale: Locale }) {
  return (
    <NetworkReleasePresentation locale={locale}>
      <AppNetworkHub locale={locale} />
    </NetworkReleasePresentation>
  );
}
