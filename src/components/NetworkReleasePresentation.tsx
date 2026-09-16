'use client';

import { useLayoutEffect, type ReactNode } from 'react';

import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';

export function NetworkReleasePresentation({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const host = document.querySelector<HTMLElement>('.networkReleasePresentation');
    if (!host) return;

    const copy = NETWORK_CANVAS_CONTROL_COPY[locale as SupportedLocale]?.you ?? 'YOU';
    let frame = 0;

    const apply = () => {
      const rootAvatar = host.querySelector<HTMLElement>('.networkCanvasPage .personNode.root .avatarSlot');
      if (!rootAvatar) return;
      rootAvatar.dataset.releaseRootCopy = copy;
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };

    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(host, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [locale]);

  return (
    <div className="networkReleasePresentation">
      {children}
      <style jsx global>{`
        .networkReleasePresentation {
          width: 100%;
          min-width: 0;
        }

        /* Keep Network aligned with the same mobile-first frame used by the
           rest of VeInvite, even on desktop. */
        .networkReleasePresentation .networkCanvasPage {
          width: min(calc(100% - 4px), 520px) !important;
          max-width: 520px !important;
          margin-inline: auto !important;
        }

        .networkReleasePresentation .networkHeader {
          padding-inline: 6px !important;
        }

        .networkReleasePresentation .searchWrap {
          width: calc(100% - 8px) !important;
        }

        /* The release root uses the same centered YOU identity language as the
           reviewed canary, but it is rendered on top of the real API-backed
           AppNetwork node rather than the QA graph. */
        .networkReleasePresentation .personNode.root .avatarSlot {
          width: 74px !important;
          height: 74px !important;
          display: grid !important;
          place-items: center !important;
          border: 1px solid rgba(244, 183, 40, .42) !important;
          border-radius: 50% !important;
          background: radial-gradient(circle at 38% 32%, rgba(244, 183, 40, .11), transparent 46%), #15140f !important;
          box-shadow: 0 0 0 4px rgba(244, 183, 40, .045), 0 0 24px rgba(244, 183, 40, .12) !important;
        }

        .networkReleasePresentation .personNode.root .avatarSlot > * {
          display: none !important;
        }

        .networkReleasePresentation .personNode.root .avatarSlot[data-release-root-copy]::after {
          content: attr(data-release-root-copy);
          max-width: calc(100% - 12px);
          overflow: hidden;
          color: #efc64c;
          font-size: .58rem;
          font-family: inherit;
          font-weight: 850;
          line-height: 1.12;
          letter-spacing: 0;
          text-align: center;
          text-overflow: ellipsis;
          white-space: nowrap;
          unicode-bidi: plaintext;
          text-shadow: 0 0 10px rgba(239, 198, 76, .18);
        }

        .networkReleasePresentation .personNode.root .identityLabel {
          display: none !important;
        }

        .networkReleasePresentation .personNode.root .personTap {
          min-width: 86px !important;
          min-height: 96px !important;
          gap: 7px !important;
        }

        .networkReleasePresentation .personNode.root .nodeMetric {
          color: #8f7943 !important;
          font-size: .46rem !important;
        }

        @media (max-width: 700px) {
          .networkReleasePresentation .networkCanvasPage {
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
