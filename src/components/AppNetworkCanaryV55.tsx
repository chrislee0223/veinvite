'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV54 } from './AppNetworkCanaryV54';

export function AppNetworkCanaryV55({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV54 locale={locale} />
      <style jsx global>{`
        /* V46's zoom rule used transform:scale(...) !important on .nodeCircle.
           That selector is as specific as the later V48 centering rule, so the
           translateX(-50%) part was lost and every 52px circle was rendered with
           its LEFT EDGE on the node anchor. Keep the circle's center on the same
           X anchor used by the SVG edge and both metadata rows. */
        .productionNetworkCanaryV45 .personNode[data-node-id] .nodeCircle {
          left: 50% !important;
          margin-left: 0 !important;
          transform: translateX(-50%) scale(var(--v46-node-scale, 1)) !important;
          transform-origin: 50% 50% !important;
        }

        /* Preserve the existing selected / pressed visual scale without ever
           dropping the horizontal centering translation. */
        .productionNetworkCanaryV45 .personNode[data-node-id].canarySelectedNode .nodeCircle,
        .productionNetworkCanaryV45 .v42ManualGroupsRoot .personNode[data-node-id].v42SelectedMember .nodeCircle,
        .productionNetworkCanaryV45 .v44GroupUxRoot .personNode[data-node-id].v44PendingNewGroupMember .nodeCircle,
        .productionNetworkCanaryV45 .personNode[data-node-id].pressing .nodeCircle,
        .productionNetworkCanaryV45 .personNode[data-node-id].v52HoldArmed .nodeCircle,
        .productionNetworkCanaryV45 .personNode[data-node-id].v52LongDragging .nodeCircle {
          transform: translateX(-50%) scale(var(--v46-selected-scale, 1.07)) !important;
        }
      `}</style>
    </>
  );
}
