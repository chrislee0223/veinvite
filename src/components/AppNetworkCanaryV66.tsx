'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV65 } from './AppNetworkCanaryV65';

/*
 * V66 is intentionally presentation-only.
 *
 * It must not own geometry, persistence, gesture state or edge coordinates.
 * Network anchors stay visually stationary; zoom/pan/navigation are the only
 * things allowed to move them on screen.
 *
 * Edge softness is created by a tiny visual fade zone around endpoint circles.
 * This avoids per-frame path recomputation and keeps V57 as the only authority
 * for person/group edge geometry.
 */
export function AppNetworkCanaryV66({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV65 locale={locale} />
      <style jsx global>{`
        /* Natural endpoint separation: the line stays geometrically stable,
           while this small dark-to-transparent halo visually lets it dissolve
           before it appears to touch the node circle. */
        .productionNetworkCanaryV45 .nodeCircle,
        .productionNetworkCanaryV45 .slotCircle,
        .productionNetworkCanaryV45 .clusterNode > span {
          position: relative;
          isolation: isolate;
          overflow: visible;
        }

        .productionNetworkCanaryV45 .nodeCircle::before,
        .productionNetworkCanaryV45 .slotCircle::before,
        .productionNetworkCanaryV45 .clusterNode > span::before {
          content: '';
          position: absolute;
          z-index: -1;
          inset: -11px;
          border-radius: 50%;
          pointer-events: none;
          background: radial-gradient(
            circle,
            rgba(8, 8, 7, .96) 0 53%,
            rgba(8, 8, 7, .68) 64%,
            rgba(8, 8, 7, .28) 76%,
            rgba(8, 8, 7, 0) 100%
          );
        }

        .productionNetworkCanaryV45 .slotCircle::before {
          inset: -10px;
          background: radial-gradient(
            circle,
            rgba(8, 8, 7, .92) 0 50%,
            rgba(8, 8, 7, .58) 64%,
            rgba(8, 8, 7, .2) 77%,
            rgba(8, 8, 7, 0) 100%
          );
        }

        /* Keep direct/member lines visually soft without adding SVG filters.
           The endpoint halo above provides the fade; these values only reduce
           the diagram-like hardness of the remaining stroke. */
        .productionNetworkCanaryV45 .v57DirectEdge {
          stroke-width: .86;
          opacity: .52;
        }

        .productionNetworkCanaryV45 .v57GroupMember {
          stroke-width: .9;
          opacity: .66;
        }

        .productionNetworkCanaryV45 .clusterSpoke {
          opacity: .5;
        }

        /* Do not add independent translation/float animation to Network nodes.
           Even sub-pixel ambient motion reads as layout instability when the
           user is pinching or comparing parent/child positions. */
        .productionNetworkCanaryV45 :is(
          .personNode,
          .slotNode,
          .clusterNode,
          .v42GroupHub
        ) {
          translate: none !important;
        }
      `}</style>
    </>
  );
}
