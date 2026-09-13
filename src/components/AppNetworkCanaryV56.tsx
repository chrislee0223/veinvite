'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV55 } from './AppNetworkCanaryV55';

export function AppNetworkCanaryV56({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV55 locale={locale} />
      <style jsx global>{`
        /* V42's grouped-member transform had higher specificity than V52/V54.
           Expanded group members therefore ignored V50/V52 free-position and
           drag offsets while the line geometry still included those offsets.
           Use exactly the same additive coordinate model as V52 nodePoint(),
           while preserving V54's circle-center Y anchor. */
        .productionNetworkCanaryV45 .v42ManualGroupsRoot .personNode.v42GroupedMember {
          transform: translate(
            calc(var(--x) + var(--v42-group-dx, 0px) + var(--v50-adjust-x, 0px) + var(--v52-adjust-x, 0px) + var(--v50-drag-dx, 0px) + var(--v52-drag-dx, 0px) - 50%),
            calc(var(--y) + var(--v42-group-dy, 0px) + var(--v50-adjust-y, 0px) + var(--v52-adjust-y, 0px) + var(--v50-drag-dy, 0px) + var(--v52-drag-dy, 0px) - 26px)
          ) !important;
        }

        .productionNetworkCanaryV45 .v42ManualGroupsRoot .personNode.v42GroupedMember.v52LongDragging,
        .productionNetworkCanaryV45 .v42ManualGroupsRoot .personNode.v42GroupedMember.v50DirectDragging,
        .productionNetworkCanaryV45 .v42ManualGroupsRoot .personNode.v42GroupedMember.v47DirectDragging {
          transition: none !important;
        }
      `}</style>
    </>
  );
}
