'use client';

import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
} from 'react';

import {
  localeFromLanguageTag,
  type Locale,
} from '@/lib/i18n/locales';
import type { PublicLeaderboardResponse } from '@/lib/types';
import { PublicLeaderboard as InviterLeaderboard } from './InviterLeaderboard';
import { PublicLeaderboardHub } from './PublicLeaderboardHub';

type RankingMotionDirection = 'forward' | 'backward' | null;

export function PublicLeaderboard({
  locale: requestedLocale,
  wallet,
  previewData,
}: {
  locale: Locale;
  wallet: string | null;
  previewData?: PublicLeaderboardResponse;
}) {
  const locale = localeFromLanguageTag(requestedLocale) ?? 'en';
  const [rankingMotionDirection, setRankingMotionDirection] =
    useState<RankingMotionDirection>(null);

  useEffect(() => {
    setRankingMotionDirection(null);
  }, [wallet]);

  const handleRankingTabClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (typeof target.closest !== 'function') return;

      const tab = target.closest<HTMLButtonElement>(
        '.rankingTabs button[role="tab"]',
      );
      if (!tab || !event.currentTarget.contains(tab)) return;
      if (tab.getAttribute('aria-selected') === 'true') return;

      const tabs = Array.from(
        tab.parentElement?.querySelectorAll<HTMLButtonElement>(
          'button[role="tab"]',
        ) ?? [],
      );
      const index = tabs.indexOf(tab);
      if (index === 0) {
        setRankingMotionDirection('backward');
      } else if (index === 1) {
        setRankingMotionDirection('forward');
      }
    },
    [],
  );

  if (previewData) {
    return (
      <InviterLeaderboard
        locale={requestedLocale}
        wallet={wallet}
        previewData={previewData}
      />
    );
  }

  return (
    <>
      <div
        className={`publicLeaderboardMotionHost${
          rankingMotionDirection
            ? ` rankingMotion-${rankingMotionDirection}`
            : ''
        }`}
        onClickCapture={handleRankingTabClickCapture}
      >
        <PublicLeaderboardHub
          locale={locale}
          wallet={wallet}
        />
      </div>
      <style jsx global>{`
        .publicLeaderboardMotionHost {
          width:100%;
        }
        .leaderboardHub .rankingTabs {
          position:relative;
        }
        .leaderboardHub .rankingTabs::after {
          content:'';
          position:absolute;
          inset-inline-start:7%;
          bottom:-1px;
          width:36%;
          height:2px;
          border-radius:999px;
          background:#f4b728;
          box-shadow:0 0 9px rgba(244,183,40,.16);
          pointer-events:none;
        }
        .leaderboardHub .rankingTabs button::after {
          opacity:0 !important;
          box-shadow:none !important;
        }
        .publicLeaderboardMotionHost.rankingMotion-forward .leaderboardHub .rankingTabs::after {
          inset-inline-start:57%;
          transition:inset-inline-start 180ms cubic-bezier(.22,1,.36,1);
        }
        .publicLeaderboardMotionHost.rankingMotion-backward .leaderboardHub .rankingTabs::after {
          inset-inline-start:7%;
          transition:inset-inline-start 180ms cubic-bezier(.22,1,.36,1);
        }
        .leaderboardHub .rankingTabs + .inviterInside,
        .leaderboardHub .rankingTabs + .countryPanel {
          position:relative;
        }
        .publicLeaderboardMotionHost.rankingMotion-forward .leaderboardHub .rankingTabs + .countryPanel {
          animation:leaderboardPanelInForward 150ms cubic-bezier(.22,1,.36,1);
        }
        .publicLeaderboardMotionHost.rankingMotion-backward .leaderboardHub .rankingTabs + .inviterInside {
          animation:leaderboardPanelInBackward 150ms cubic-bezier(.22,1,.36,1);
        }
        @keyframes leaderboardPanelInForward {
          from {
            opacity:.82;
            inset-inline-start:6px;
          }
          to {
            opacity:1;
            inset-inline-start:0;
          }
        }
        @keyframes leaderboardPanelInBackward {
          from {
            opacity:.82;
            inset-inline-start:-6px;
          }
          to {
            opacity:1;
            inset-inline-start:0;
          }
        }

        /* Country rows use the exact same responsive five-row geometry as the
           reviewed inviter leaderboard: 50px desktop, 46px compact mobile and
           44px narrow mobile. */
        .leaderboardHub .countryRow,
        .leaderboardHub .countryPlaceholderRow {
          height:50px !important;
          min-height:50px !important;
          max-height:50px !important;
          padding-block:0 !important;
        }
        .leaderboardHub .countryScroll,
        .leaderboardHub .countrySkeleton,
        .leaderboardHub .countryState {
          height:250px !important;
          min-height:250px !important;
          max-height:250px !important;
        }

        /* Ranking surfaces are vertical-only scrollers. Lock every row to the
           card width so long rewards, localized copy or future movement labels
           cannot create a sideways scrollbar or horizontal touch drift. */
        .leaderboardHub .rankScroll,
        .leaderboardHub .countryScroll {
          overflow-x:hidden !important;
          touch-action:pan-y;
        }
        .leaderboardHub .rows,
        .leaderboardHub .tableHeader,
        .leaderboardHub .rankRow,
        .leaderboardHub .countryHeader,
        .leaderboardHub .countryRow,
        .leaderboardHub .countryPlaceholderRow {
          min-width:0 !important;
          max-width:100% !important;
          box-sizing:border-box;
        }
        .leaderboardHub .rows {
          overflow-x:hidden;
        }
        .leaderboardHub .rankMetric,
        .leaderboardHub .rewardMetric {
          min-width:0 !important;
          max-width:100% !important;
        }
        .leaderboardHub .rewardMetric {
          overflow:hidden;
        }
        .leaderboardHub .rewardMetric b {
          max-width:100%;
          letter-spacing:-.015em;
        }

        @media (max-width:430px) {
          .leaderboardHub .rankingTabs::after {
            inset-inline-start:6%;
            width:38%;
          }
          .publicLeaderboardMotionHost.rankingMotion-forward .leaderboardHub .rankingTabs::after {
            inset-inline-start:56%;
          }
          .publicLeaderboardMotionHost.rankingMotion-backward .leaderboardHub .rankingTabs::after {
            inset-inline-start:6%;
          }
        }
        @media (max-width:420px) {
          .leaderboardHub .countryRow,
          .leaderboardHub .countryPlaceholderRow {
            height:46px !important;
            min-height:46px !important;
            max-height:46px !important;
          }
          .leaderboardHub .countryScroll,
          .leaderboardHub .countrySkeleton,
          .leaderboardHub .countryState {
            height:230px !important;
            min-height:230px !important;
            max-height:230px !important;
          }
          /* Completion counts are short; give their spare width to the exact
             B3TR reward value instead of forcing the whole table wider. */
          .leaderboardHub .inviterInside .rankingCard {
            --completed-column:54px !important;
            --reward-column:98px !important;
          }
          .leaderboardHub .rewardMetric b {
            font-size:clamp(.56rem,2.35vw,.65rem) !important;
            letter-spacing:-.02em;
          }
        }
        @media (max-width:360px) {
          .leaderboardHub .countryRow,
          .leaderboardHub .countryPlaceholderRow {
            height:44px !important;
            min-height:44px !important;
            max-height:44px !important;
          }
          .leaderboardHub .countryScroll,
          .leaderboardHub .countrySkeleton,
          .leaderboardHub .countryState {
            height:220px !important;
            min-height:220px !important;
            max-height:220px !important;
          }
          .leaderboardHub .inviterInside .rankingCard {
            --completed-column:50px !important;
            --reward-column:94px !important;
          }
          .leaderboardHub .rewardMetric b {
            font-size:clamp(.54rem,2.45vw,.61rem) !important;
          }
        }
        @media (prefers-reduced-motion:reduce) {
          .leaderboardHub .rankingTabs::after {
            transition:none !important;
          }
          .publicLeaderboardMotionHost.rankingMotion-forward .leaderboardHub .rankingTabs + .countryPanel,
          .publicLeaderboardMotionHost.rankingMotion-backward .leaderboardHub .rankingTabs + .inviterInside {
            animation:none !important;
          }
        }
      `}</style>
    </>
  );
}
