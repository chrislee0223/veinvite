'use client';

import type { SupportedLocale } from '@/lib/i18n/locales';
import type { PublicLeaderboardResponse } from '@/lib/types';
import { PublicLeaderboard as InviterLeaderboard } from './InviterLeaderboard';
import { PublicLeaderboardProductionHub } from './PublicLeaderboardProductionHub';

export function PublicLeaderboard({
  locale,
  wallet,
  previewData,
}: {
  locale: SupportedLocale;
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

  return (
    <PublicLeaderboardProductionHub
      locale={locale}
      wallet={wallet}
    />
  );
}
