'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV66 } from './AppNetworkCanaryV66';

/*
 * V67 corrects V66's presentation regressions without taking ownership of
 * Network geometry, persistence, spacing, hit targets or gestures.
 */
export function AppNetworkCanaryV67({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV66 locale={locale} />
      <style jsx global>{`
        /* Keep each person / Available node as one painted circle. V66/V67 used
           separate pseudo-element dark fades behind the visible circle; those
           backdrops did not share the circle's zoom/pressed scale and therefore
           visibly separated from its gold outline. The circle's own opaque
           background now does all endpoint occlusion. */
        .productionNetworkCanaryV45 .nodeCircle::before,
        .productionNetworkCanaryV45 .slotCircle::before,
        .productionNetworkCanaryV45 .clusterNode > span::before,
        .productionNetworkCanaryV45 .personNode::before,
        .productionNetworkCanaryV45 .slotNode::before {
          content: none !important;
          display: none !important;
        }

        .productionNetworkCanaryV45 .nodeCircle,
        .productionNetworkCanaryV45 .slotCircle,
        .productionNetworkCanaryV45 .clusterNode > span {
          overflow: hidden !important;
          isolation: auto !important;
        }

        .productionNetworkCanaryV45 .personNode,
        .productionNetworkCanaryV45 .slotNode {
          isolation: auto !important;
        }

        /* YOU is an opaque occluder rather than a translucent window. V57 and
           legacy Available paths remain geometrically unchanged but cannot show
           through the center circle. */
        .productionNetworkCanaryV45 .centerCircle {
          background: radial-gradient(
            circle at 50% 45%,
            rgb(24, 21, 13) 0%,
            rgb(13, 13, 11) 62%,
            rgb(13, 13, 11) 100%
          ) !important;
        }
      `}</style>
    </>
  );
}
