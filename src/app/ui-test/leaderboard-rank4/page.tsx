import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PublicLeaderboard } from '@/components/PublicLeaderboard';
import type {
  PublicLeaderboardEntry,
  PublicLeaderboardResponse,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite Rank 4 Preview',
  robots: {
    index: false,
    follow: false,
  },
};

const CURRENT_WALLET = '0x9d3be3deec483340e8da1d6d56171b618a7aaf10';
const TOKEN_WEI = 10n ** 18n;

function previewWallet(rank: number): string {
  return `0x${rank.toString(16).padStart(40, '0')}`;
}

function buildRankFourPreview(): PublicLeaderboardResponse {
  const leaders: PublicLeaderboardEntry[] = Array.from(
    { length: 100 },
    (_, index) => {
      const rank = index + 1;
      const isCurrentWallet = rank === 4;
      return {
        rank,
        walletAddress: isCurrentWallet ? CURRENT_WALLET : previewWallet(rank),
        completedReferrals: Math.max(1, 12 - Math.floor((rank - 1) / 9)),
        totalRewardWei: (BigInt(Math.max(8, 560 - rank * 5)) * TOKEN_WEI).toString(),
        isCurrentWallet,
      };
    },
  );

  return {
    generatedAt: '2026-09-02T00:00:00.000Z',
    network: 'mainnet',
    currentRoundId: 114,
    reportingStartRound: 113,
    impact: {
      totalActivatedUsers: 128,
      newUsers: 93,
      returningUsers: 35,
    },
    leaders,
    currentUser: leaders[3],
  };
}

const previewData = buildRankFourPreview();

export default function LeaderboardRankFourPreviewPage() {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) {
    notFound();
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '24px 16px 96px',
        background: '#080807',
      }}
    >
      <div style={{ width: 'min(100%, 520px)', margin: '0 auto' }}>
        <PublicLeaderboard
          locale="ko"
          wallet={CURRENT_WALLET}
          previewData={previewData}
        />
      </div>
    </main>
  );
}
