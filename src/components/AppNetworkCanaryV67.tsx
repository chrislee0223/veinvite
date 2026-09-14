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
        /* Remove V66's oversized circle-local halos. They were readable as dark
           rings, reduced outline contrast and could intrude on nearby metadata. */
        .productionNetworkCanaryV45 .nodeCircle::before,
        .productionNetworkCanaryV45 .slotCircle::before,
        .productionNetworkCanaryV45 .clusterNode > span::before {
          content: none !important;
          display: none !important;
        }

        /* Only restore avatar-safe clipping. Border, background, hover, pressing,
           joining, selected and edit-state visuals remain owned by the mature
           V37/V42 layers so this correction cannot silently replace them. */
        .productionNetworkCanaryV45 .nodeCircle,
        .productionNetworkCanaryV45 .slotCircle,
        .productionNetworkCanaryV45 .clusterNode > span {
          overflow: hidden !important;
          isolation: auto !important;
        }

        /* Endpoint softness is a tiny paint-only patch. The person circle is 52px
           and the Available circle is 46px; these patches extend only 3px beyond
           the visible circle instead of V66's 10-11px halo. */
        .productionNetworkCanaryV45 .personNode,
        .productionNetworkCanaryV45 .slotNode {
          isolation: isolate;
        }

        .productionNetworkCanaryV45 .personNode::before,
        .productionNetworkCanaryV45 .slotNode::before {
          content: '';
          position: absolute;
          left: 50%;
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
        }

        .productionNetworkCanaryV45 .personNode::before {
          top: 26px;
          width: 58px;
          height: 58px;
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle,
            rgba(8, 8, 7, .94) 0 87%,
            rgba(8, 8, 7, .58) 91%,
            rgba(8, 8, 7, .17) 96%,
            rgba(8, 8, 7, 0) 100%
          );
        }

        .productionNetworkCanaryV45 .slotNode::before {
          top: 23px;
          width: 52px;
          height: 52px;
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle,
            rgba(8, 8, 7, .92) 0 86%,
            rgba(8, 8, 7, .54) 91%,
            rgba(8, 8, 7, .15) 96%,
            rgba(8, 8, 7, 0) 100%
          );
        }

        /* Keep the avatar circle above the fade, but keep readable information
           above the circle. No position/top/left/margin/transform is changed. */
        .productionNetworkCanaryV45 .personNode > .nodeCircle,
        .productionNetworkCanaryV45 .slotNode > .slotCircle {
          z-index: 1 !important;
        }

        .productionNetworkCanaryV45 .personNode > b,
        .productionNetworkCanaryV45 .personNode > small,
        .productionNetworkCanaryV45 .slotNode > b {
          z-index: 2 !important;
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

        /* V57 does not read CSS animation offsets for group hubs, so hubs stay
           static. Person/Available/cluster ambience remains paint-only and is
           deliberately sub-pixel-to-1px on mobile. */
        @supports (translate: 1px 1px) {
          .productionNetworkCanaryV45 .v42GroupHub {
            animation: none !important;
            translate: none !important;
          }

          .productionNetworkCanaryV45 .personNode {
            --v66-fx1: 1.1px !important;
            --v66-fy1: -1.5px !important;
            --v66-fx2: -1px !important;
            --v66-fy2: 1.1px !important;
            --v66-fx3: .9px !important;
            --v66-fy3: .5px !important;
          }

          .productionNetworkCanaryV45 .slotNode,
          .productionNetworkCanaryV45 .clusterNode {
            --v66-fx1: .9px !important;
            --v66-fy1: -1.3px !important;
            --v66-fx2: -.8px !important;
            --v66-fy2: .9px !important;
            --v66-fx3: .7px !important;
            --v66-fy3: .4px !important;
          }

          @media (max-width: 640px) {
            .productionNetworkCanaryV45 .personNode {
              --v66-fx1: .7px !important;
              --v66-fy1: -.95px !important;
              --v66-fx2: -.6px !important;
              --v66-fy2: .72px !important;
              --v66-fx3: .62px !important;
              --v66-fy3: .3px !important;
            }

            .productionNetworkCanaryV45 .slotNode,
            .productionNetworkCanaryV45 .clusterNode {
              --v66-fx1: .58px !important;
              --v66-fy1: -.82px !important;
              --v66-fx2: -.5px !important;
              --v66-fy2: .58px !important;
              --v66-fx3: .48px !important;
              --v66-fy3: .26px !important;
            }
          }
        }
      `}</style>
    </>
  );
}
