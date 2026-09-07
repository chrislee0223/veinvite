'use client';

import {
  localeFromLanguageTag,
  type Locale,
} from '@/lib/i18n/locales';
import type { PublicLeaderboardResponse } from '@/lib/types';
import { PublicLeaderboard as InviterLeaderboard } from './InviterLeaderboard';
import { PublicLeaderboardHub } from './PublicLeaderboardHub';

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
      <PublicLeaderboardHub
        locale={locale}
        wallet={wallet}
      />
      <style jsx global>{`
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
        }
      `}</style>
    </>
  );
}
