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
        /* V66's circle-local halos became visible as large dark rings and also
           forced overflow:visible on the future avatar container. Remove them. */
        .productionNetworkCanaryV45 .nodeCircle::before,
        .productionNetworkCanaryV45 .slotCircle::before,
        .productionNetworkCanaryV45 .clusterNode > span::before {
          content: none !important;
          display: none !important;
        }

        /* Restore clear base outlines and avatar-safe clipping. Border properties
           intentionally stay non-important so pressing/joining/selected states
           from the mature layers keep their higher-specificity feedback. */
        .productionNetworkCanaryV45 .nodeCircle {
          overflow: hidden !important;
          isolation: auto !important;
          border-width: 1px;
          border-style: solid;
          border-color: rgba(210, 174, 65, .46);
          background: #0d0d0b;
        }

        .productionNetworkCanaryV45 .slotCircle {
          overflow: hidden !important;
          isolation: auto !important;
          border-width: 1px;
          border-style: dashed;
          border-color: rgba(226, 181, 62, .58);
          background: #0d0d0b;
        }

        .productionNetworkCanaryV45 .stage.editMode .nodeCircle,
        .productionNetworkCanaryV45 .stage.editMode .slotCircle {
          border-color: rgba(244, 183, 40, .65);
        }

        .productionNetworkCanaryV45 .clusterNode > span {
          isolation: auto !important;
          overflow: hidden !important;
        }

        /* Endpoint softness is a tiny paint-only patch behind the mature node.
           The buttons form isolated stacking contexts, so z-index:-1 remains
           behind their existing circle/text while the entire node still paints
           above V57. No child position/display/spacing property is overridden. */
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
          z-index: -1;
        }

        .productionNetworkCanaryV45 .personNode::before {
          top: 26px;
          width: 60px;
          height: 60px;
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle,
            rgba(8, 8, 7, .92) 0 84%,
            rgba(8, 8, 7, .52) 89%,
            rgba(8, 8, 7, .16) 95%,
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
            rgba(8, 8, 7, .48) 90%,
            rgba(8, 8, 7, .13) 96%,
            rgba(8, 8, 7, 0) 100%
          );
        }

        /* The center is an occluder rather than a translucent window. This hides
           both V57 person/group paths and legacy Available paths inside YOU. */
        .productionNetworkCanaryV45 .centerCircle {
          background: radial-gradient(
            circle at 50% 45%,
            rgb(24, 21, 13) 0%,
            rgb(13, 13, 11) 62%,
            rgb(13, 13, 11) 100%
          ) !important;
        }

        /* V57 does not read CSS animation offsets for group hubs, so hubs stay
           static. People/Available/cluster ambience remains paint-only and is
           reduced further on mobile to keep the edge-to-node illusion tight. */
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
