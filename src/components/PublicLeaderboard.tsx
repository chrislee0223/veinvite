'use client';

import {
  localeFromLanguageTag,
  type Locale,
} from '@/lib/i18n/locales';
import type { PublicLeaderboardResponse } from '@/lib/types';
import { PublicLeaderboard as InviterLeaderboard } from './InviterLeaderboard';
import { PublicLeaderboardHub } from './PublicLeaderboardHub';

export function PublicLeaderboard({
  locale,
  wallet,
  previewData,
}: {
  locale: Locale;
  wallet: string | null;
  previewData?: PublicLeaderboardResponse;
}) {
  if (previewData) {
    return (
      <InviterLeaderboard
        locale={locale}
        wallet={wallet}
        previewData={previewData}
      />
    );
  }

  const supportedLocale = localeFromLanguageTag(locale) ?? 'en';

  return (
    <>
      <PublicLeaderboardHub
        locale={supportedLocale}
        wallet={wallet}
      />
      <style jsx global>{`
        /* Country ranking intentionally stays a single total: NEW/RETURNING
           remain internal analytics only and are not exposed in this view. */
        .leaderboardHub .countryMix {
          display:none !important;
        }
        .leaderboardHub .countryText {
          display:block !important;
        }
        .leaderboardHub .countryRow {
          height:50px !important;
          min-height:50px !important;
          padding-block:0 !important;
        }
        .leaderboardHub .countryScroll,
        .leaderboardHub .countryState {
          height:250px !important;
          min-height:250px !important;
          max-height:250px !important;
        }
        @media (max-width:420px) {
          .leaderboardHub .countryRow {
            height:46px !important;
            min-height:46px !important;
          }
          .leaderboardHub .countryScroll,
          .leaderboardHub .countryState {
            height:230px !important;
            min-height:230px !important;
            max-height:230px !important;
          }
        }
        @media (max-width:360px) {
          .leaderboardHub .countryRow {
            height:44px !important;
            min-height:44px !important;
          }
          .leaderboardHub .countryScroll,
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
