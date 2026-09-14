'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV65 } from './AppNetworkCanaryV65';

/*
 * V66 is intentionally presentation-only.
 *
 * It must not own geometry, persistence, gesture state or edge coordinates.
 * The floating motion uses the individual CSS `translate` property so the
 * existing transform stack from V37/V50/V52/V61/V63 remains untouched.
 * Browsers/WebViews without individual-transform support simply keep the
 * static layout because the motion lives behind @supports.
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

        @supports (translate: 1px 1px) {
          .productionNetworkCanaryV45 .personNode,
          .productionNetworkCanaryV45 .slotNode,
          .productionNetworkCanaryV45 .clusterNode,
          .productionNetworkCanaryV45 .v42GroupHub {
            --v66-fx1: 1.6px;
            --v66-fy1: -2.6px;
            --v66-fx2: -1.3px;
            --v66-fy2: 1.7px;
            --v66-fx3: 1.8px;
            --v66-fy3: .7px;
            animation: v66AmbientFloat 9.4s ease-in-out infinite;
          }

          .productionNetworkCanaryV45 .personNode:nth-child(4n + 2) {
            --v66-fx1: -1.7px;
            --v66-fy1: -1.6px;
            --v66-fx2: 1.2px;
            --v66-fy2: 2.1px;
            --v66-fx3: -.8px;
            --v66-fy3: .9px;
            animation-duration: 10.8s;
            animation-delay: -3.1s;
          }

          .productionNetworkCanaryV45 .personNode:nth-child(4n + 3) {
            --v66-fx1: 1px;
            --v66-fy1: -2px;
            --v66-fx2: -1.8px;
            --v66-fy2: .8px;
            --v66-fx3: 1.1px;
            --v66-fy3: 2px;
            animation-duration: 11.7s;
            animation-delay: -6.2s;
          }

          .productionNetworkCanaryV45 .personNode:nth-child(4n) {
            --v66-fx1: -1px;
            --v66-fy1: -2.3px;
            --v66-fx2: 1.7px;
            --v66-fy2: 1.1px;
            --v66-fx3: -.9px;
            --v66-fy3: 1.9px;
            animation-duration: 12.4s;
            animation-delay: -8.4s;
          }

          .productionNetworkCanaryV45 .slotNode {
            --v66-fx1: 1.2px;
            --v66-fy1: -2px;
            --v66-fx2: -1.1px;
            --v66-fy2: 1.3px;
            --v66-fx3: .8px;
            --v66-fy3: .9px;
            animation-duration: 10.6s;
          }

          .productionNetworkCanaryV45 .slotNode:nth-child(2n) {
            animation-delay: -5.2s;
          }

          .productionNetworkCanaryV45 .clusterNode {
            --v66-fx1: 1px;
            --v66-fy1: -1.8px;
            --v66-fx2: -1px;
            --v66-fy2: 1.4px;
            --v66-fx3: .7px;
            --v66-fy3: .5px;
            animation-duration: 11.8s;
          }

          .productionNetworkCanaryV45 .v42GroupHub {
            --v66-fx1: .8px;
            --v66-fy1: -1.5px;
            --v66-fx2: -.8px;
            --v66-fy2: 1.1px;
            --v66-fx3: .6px;
            --v66-fy3: .4px;
            animation-duration: 12.8s;
          }

          .productionNetworkCanaryV45 .v42GroupHub:nth-child(2n) {
            animation-delay: -6.7s;
          }

          /* Stress views can render hundreds of people. Limit independent
             compositor animations to the first 120 person nodes. Dense views
             still feel alive without turning every rendered node into a moving
             layer. */
          .productionNetworkCanaryV45 .personNode:nth-child(n + 121) {
            animation: none;
            translate: none;
          }

          /* Gesture ownership always wins over ambience. Pausing rather than
             resetting preserves the current sub-pixel offset and avoids a snap
             when a drag starts or ends. */
          .productionNetworkCanaryV45.veinviteInteracting :is(
            .personNode,
            .slotNode,
            .clusterNode,
            .v42GroupHub
          ),
          .productionNetworkCanaryV45.v63PinchGuard :is(
            .personNode,
            .slotNode,
            .clusterNode,
            .v42GroupHub
          ),
          .productionNetworkCanaryV45.v50NetworkTransition :is(
            .personNode,
            .slotNode,
            .clusterNode,
            .v42GroupHub
          ),
          .productionNetworkCanaryV45.v52NetworkTransition :is(
            .personNode,
            .slotNode,
            .clusterNode,
            .v42GroupHub
          ),
          .productionNetworkCanaryV45 .stage.editMode :is(
            .personNode,
            .slotNode,
            .clusterNode,
            .v42GroupHub
          ),
          .productionNetworkCanaryV45 .personNode.v63DirectDragging,
          .productionNetworkCanaryV45 .personNode.v61DirectGroupDragging,
          .productionNetworkCanaryV45 .personNode.v61GroupTransfer,
          .productionNetworkCanaryV45 .personNode.v63TransferSettling,
          .productionNetworkCanaryV45 .v42GroupHub.v61GroupDragging,
          .productionNetworkCanaryV45 .v42CollapsedMember {
            animation-play-state: paused !important;
          }

          @keyframes v66AmbientFloat {
            0%, 100% { translate: 0 0; }
            24% { translate: var(--v66-fx1) var(--v66-fy1); }
            51% { translate: var(--v66-fx2) var(--v66-fy2); }
            77% { translate: var(--v66-fx3) var(--v66-fy3); }
          }

          @media (max-width: 640px) {
            .productionNetworkCanaryV45 .personNode,
            .productionNetworkCanaryV45 .slotNode,
            .productionNetworkCanaryV45 .clusterNode {
              --v66-fx1: 1.1px;
              --v66-fy1: -1.8px;
              --v66-fx2: -.9px;
              --v66-fy2: 1.2px;
              --v66-fx3: 1.1px;
              --v66-fy3: .5px;
            }

            .productionNetworkCanaryV45 .v42GroupHub {
              --v66-fx1: .6px;
              --v66-fy1: -1.1px;
              --v66-fx2: -.6px;
              --v66-fy2: .8px;
              --v66-fx3: .5px;
              --v66-fy3: .3px;
            }
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .productionNetworkCanaryV45 :is(
            .personNode,
            .slotNode,
            .clusterNode,
            .v42GroupHub
          ) {
            animation: none !important;
            translate: none !important;
          }
        }
      `}</style>
    </>
  );
}
