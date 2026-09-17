'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV65 } from './AppNetworkCanaryV65';

/*
 * V66 is intentionally presentation-only.
 *
 * Network geometry must remain visually stationary unless the user explicitly
 * pans, zooms, drags a node, or navigates to another network. Earlier V66
 * ambience used the individual CSS `translate` property to float visible nodes
 * by a few pixels. Even though that did not mutate stored geometry, it created
 * a real painted-position drift and could desynchronise parent-return snapshots.
 * Keep only the endpoint/edge softness here and explicitly pin decorative
 * translate back to zero.
 */
export function AppNetworkCanaryV66({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV65 locale={locale} />
      <style jsx global>{`
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

        /* No idle element may change its painted position. This also neutralises
           the legacy V67 --v66-* tuning variables, which are intentionally left
           harmless until that older presentation wrapper is retired. */
        .productionNetworkCanaryV45 :is(
          .personNode,
          .slotNode,
          .clusterNode,
          .v42GroupHub
        ) {
          animation-name: none !important;
          translate: none !important;
        }
      `}</style>
    </>
  );
}
