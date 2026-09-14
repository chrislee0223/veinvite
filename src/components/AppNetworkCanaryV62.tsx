'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV61 } from './AppNetworkCanaryV61';

export function AppNetworkCanaryV62({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV61 locale={locale} />
      <style jsx global>{`
        /* V61 feedback badges need a positioning context, but canvas group hubs
           must remain absolute or their saved world coordinates are lost. */
        .productionNetworkCanaryV45 .v42GroupHub.v61DropPreview,
        .productionNetworkCanaryV45 .v42GroupHub.v61GroupAccepted {
          position: absolute !important;
        }

        .productionNetworkCanaryV45 .v42GroupRow.v61DropPreview,
        .productionNetworkCanaryV45 .v42GroupRow.v61GroupAccepted {
          position: relative !important;
        }
      `}</style>
    </>
  );
}
