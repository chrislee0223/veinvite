'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkReleaseCanvas } from './AppNetworkReleaseCanvas';
import { NetworkReleaseGestureBoundary } from './NetworkReleaseGestureBoundary';
import { NetworkReleaseGroups } from './NetworkReleaseGroups';
import { NetworkReleaseSlots } from './NetworkReleaseSlots';

// V71 is the release canary for the real API-backed Network surface.
// The legacy V37-V70 radial stack stays available only for QA/stress fixtures.
export function AppNetworkCanaryV71({ locale }: { locale: Locale }) {
  return (
    <NetworkReleaseSlots locale={locale}>
      <NetworkReleaseGroups locale={locale}>
        <NetworkReleaseGestureBoundary>
          <AppNetworkReleaseCanvas locale={locale} />
        </NetworkReleaseGestureBoundary>
      </NetworkReleaseGroups>
    </NetworkReleaseSlots>
  );
}
