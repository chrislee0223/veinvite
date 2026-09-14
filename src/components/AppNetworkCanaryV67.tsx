'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV66 } from './AppNetworkCanaryV66';

/*
 * V67 corrects the presentation regressions introduced by V66 without taking
 * ownership of Network geometry, persistence or gestures.
 *
 * - remove the oversized circle-local halos that reduced border contrast
 * - keep node circles avatar-safe by clipping their future image contents
 * - move endpoint softness to a tiny button-level occlusion/fade patch
 * - keep metadata clear of the circle with only a small visual gap increase
 * - make YOU fully opaque so no authoritative/slot edge can show through it
 * - reduce ambient travel and keep group hubs static because V57 intentionally
 *   does not read CSS animation offsets
 */
export function AppNetworkCanaryV67({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV66 locale={locale} />
      <style jsx global>{`
        /* Retire V66's large circle-local halos. They were visually readable as
           dark rings and also forced overflow:visible on the future avatar clip. */
        .productionNetworkCanaryV45 .nodeCircle::before,
        .productionNetworkCanaryV45 .slotCircle::before,
        .productionNetworkCanaryV45 .clusterNode > span::before {
          content: none !important;
          display: none !important;
        }

        /* Preserve the intended base circle treatment and future avatar clipping.
           Do not use !important on border style/color here: higher-specificity
           selected/pressed/joining/edit states must still be able to change them. */
        .productionNetworkCanaryV45 .nodeCircle {
          overflow: hidden !important;
          isolation: auto !important;
          z-index: 1;
          border-width: 1px;
          border-style: solid;
          border-color: rgba(210, 174, 65, .46);
          background: #0d0d0b;
        }

        .productionNetworkCanaryV45 .slotCircle {
          overflow: hidden !important;
          isolation: auto !important;
          z-index: 1;
          border-width: 1px;
          border-style: dashed;
          border-color: rgba(226, 181, 62, .58);
          background: #0d0d0b;
        }

        .productionNetworkCanaryV45 .clusterNode > span {
          isolation: auto !important;
          overflow: hidden !important;
        }

        /* Endpoint softness now lives on the whole node button, not inside the
           circle. The patch is only ~4px wider than the visible circle, so it
           hides the last few pixels of an edge without creating a second ring.
           It is paint-only: no geometry, pointer or storage state is involved. */
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
          width: 60px;
          height: 60px;
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle,
            rgba(8, 8, 7, .92) 0 84%,
            rgba(8, 8, 7, .56) 89%,
            rgba(8, 8, 7, .18) 95%,
            rgba(8, 8, 7, 0) 100%
          );
        }

        .productionNetworkCanaryV45 .slotNode::before {
          top: 23px;
          width: 54px;
          height: 54px;
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle,
            rgba(8, 8, 7, .9) 0 84%,
            rgba(8, 8, 7, .5) 90%,
            rgba(8, 8, 7, .14) 96%,
            rgba(8, 8, 7, 0) 100%
          );
        }

        /* Keep every visible part of the node above the paint-only endpoint
           patch. position:relative does not change layout, alignment or hit area. */
        .productionNetworkCanaryV45 .personNode > .nodeCircle,
        .productionNetworkCanaryV45 .slotNode > .slotCircle,
        .productionNetworkCanaryV45 .personNode > b,
        .productionNetworkCanaryV45 .personNode > small,
        .productionNetworkCanaryV45 .slotNode > b {
          position: relative !important;
          z-index: 1;
        }

        /* V54 pins the circle center with a fixed -26px/-23px Y offset, so this
           tiny metadata margin does not move the circle, edge anchor or saved
           position. It only creates breathing room below the visual avatar. */
        .productionNetworkCanaryV45 .personNode > b,
        .productionNetworkCanaryV45 .slotNode > b {
          margin-top: 2px !important;
        }

        /* YOU is an occluder, not a translucent window. Keep the same warm dark
           tone but use fully opaque colors so V57 and Available paths never show
           inside the center circle. */
        .productionNetworkCanaryV45 .centerCircle {
          background: radial-gradient(
            circle at 50% 45%,
            rgb(24, 21, 13) 0%,
            rgb(13, 13, 11) 62%,
            rgb(13, 13, 11) 100%
          ) !important;
        }

        /* Group hubs keep authoritative V57 geometry exact. Person/slot/cluster
           travel remains subtle enough that the endpoint patch hides the visual
           delta without making the canvas feel static. */
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
              --v66-fx1: .75px !important;
              --v66-fy1: -1.05px !important;
              --v66-fx2: -.65px !important;
              --v66-fy2: .8px !important;
              --v66-fx3: .7px !important;
              --v66-fy3: .35px !important;
            }

            .productionNetworkCanaryV45 .slotNode,
            .productionNetworkCanaryV45 .clusterNode {
              --v66-fx1: .65px !important;
              --v66-fy1: -.9px !important;
              --v66-fx2: -.55px !important;
              --v66-fy2: .65px !important;
              --v66-fx3: .55px !important;
              --v66-fy3: .3px !important;
            }
          }
        }
      `}</style>
    </>
  );
}
