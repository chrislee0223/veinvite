import { supabaseAdmin } from '@/lib/supabaseServer';
import type { VeBetterNetwork } from '@/lib/vebetter/network';

export const LEADERBOARD_RANKING_ALGORITHM_VERSION =
  'paid_referrals_v2';

export type LeaderboardSnapshotMaintenanceSummary = {
  network: VeBetterNetwork;
  rankingAlgorithmVersion: string;
  publishedCount: number;
};

function safeCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Leaderboard snapshot publisher returned an invalid count.');
  }
  return parsed;
}

export async function publishLeaderboardRoundSnapshots(
  network: VeBetterNetwork,
): Promise<LeaderboardSnapshotMaintenanceSummary> {
  const { data, error } = await supabaseAdmin.rpc(
    'publish_leaderboard_round_snapshots',
    {
      p_network: network,
      p_ranking_algorithm_version:
        LEADERBOARD_RANKING_ALGORITHM_VERSION,
    },
  );

  if (error) {
    throw new Error(
      `Leaderboard snapshots could not be published: ${error.message}`,
    );
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(
      'Leaderboard snapshot publisher returned malformed data.',
    );
  }

  const payload = data as Record<string, unknown>;
  const returnedNetwork = String(payload.network ?? '');
  const rankingAlgorithmVersion = String(
    payload.rankingAlgorithmVersion ?? '',
  );

  if (
    returnedNetwork !== network ||
    rankingAlgorithmVersion !==
      LEADERBOARD_RANKING_ALGORITHM_VERSION
  ) {
    throw new Error(
      'Leaderboard snapshot publisher returned mismatched metadata.',
    );
  }

  return {
    network,
    rankingAlgorithmVersion,
    publishedCount: safeCount(payload.publishedCount),
  };
}
