'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV53 } from './AppNetworkCanaryV53';

export function AppNetworkCanaryV54({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV53 locale={locale} />
      <style jsx global>{`
        .productionNetworkCanaryV45 .personNode {
          transform: translate(
            calc(var(--x) + var(--v42-group-dx, 0px) + var(--v50-adjust-x, 0px) + var(--v52-adjust-x, 0px) + var(--v50-drag-dx, 0px) + var(--v52-drag-dx, 0px) - 50%),
            calc(var(--y) + var(--v42-group-dy, 0px) + var(--v50-adjust-y, 0px) + var(--v52-adjust-y, 0px) + var(--v50-drag-dy, 0px) + var(--v52-drag-dy, 0px) - 26px)
          ) !important;
        }

        .productionNetworkCanaryV45 .personNode > b,
        .productionNetworkCanaryV45 .personNode > small {
          position: static !important;
          left: auto !important;
          right: auto !important;
          width: 116px !important;
          min-width: 116px !important;
          max-width: 116px !important;
          margin-left: auto !important;
          margin-right: auto !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          align-self: center !important;
          text-align: center !important;
          transform: none !important;
          transform-origin: 50% 0 !important;
        }

        .productionNetworkCanaryV45 .slotNode {
          transform: translate(
            calc(var(--x) + var(--v53-slot-adjust-x, 0px) + var(--v53-slot-drag-x, 0px) - 50%),
            calc(var(--y) + var(--v53-slot-adjust-y, 0px) + var(--v53-slot-drag-y, 0px) - 23px)
          ) !important;
        }

        .productionNetworkCanaryV45 .slotNode > b {
          left: 0 !important;
          right: auto !important;
          width: 104px !important;
          max-width: 104px !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          text-align: center !important;
          transform-origin: 50% 0 !important;
        }
      `}</style>
    </>
  );
}
