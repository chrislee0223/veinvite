import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import { supabaseAdmin } from '@/lib/supabaseServer';
import type {
  PublicLeaderboardEntry,
  PublicLeaderboardResponse,
  RankMovement,
} from '@/lib/types';
import { readCurrentVeBetterRound } from '@/lib/vebetter/currentRound';

export const dynamic = 'force-dynamic';

const WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const LEADERBOARD_SIZE = 100;
const MAX_GROWTH_ROUNDS = 260;
const TRANSIENT_AUTH_RETRY_MS = 750;
const RANKING_ALGORITHM_VERSION = 'paid_referrals_v1';
const RANK_MOVEMENTS = new Set<RankMovement>([
  'UP',
  'DOWN',
  'SAME',
  'NEW',
  'UNAVAILABLE',
]);

type LeaderboardRow = {
  rank_position: number | string;
  wallet_address: string;
  completed_referrals: number | string;
  total_reward_wei: string;
  is_current_wallet: boolean;
};

type LeaderboardMovementRow = LeaderboardRow & {
  previous_rank: number | string | null;
  rank_change: number | string | null;
  rank_movement: string;
};

type ComparisonRow = {
  comparison_available: boolean;
  comparison_round_id: number | string | null;
  comparison_end_block: number | string | null;
  comparison_published_at: string | null;
  comparison_row_count: number | string | null;
  ranking_algorithm_version: string;
};

type GrowthRow = {
  round_id: number | string;
  cumulative_activated_new_users: number | string;
  cumulative_activated_returning_users: number | string;
};

function parseCount(
  value: number | string,
  fieldName: string,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} returned an invalid count.`);
  }

  return parsed;
}

function parseSignedInteger(
  value: number | string,
  fieldName: string,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${fieldName} returned an invalid integer.`);
  }

  return parsed;
}

function normalizeBaseLeaderboardRow(
  row: LeaderboardRow,
): Omit<
  PublicLeaderboardEntry,
  'previousRank' | 'rankChange' | 'rankMovement'
> {
  const walletAddress = row.wallet_address.trim().toLowerCase();

  if (!WALLET_PATTERN.test(walletAddress)) {
    throw new Error('Leaderboard returned an invalid wallet address.');
  }

  if (!/^\d+$/.test(row.total_reward_wei)) {
    throw new Error('Leaderboard returned an invalid reward amount.');
  }

  return {
    rank: parseCount(row.rank_position, 'Leaderboard rank'),
    walletAddress,
    completedReferrals: parseCount(
      row.completed_referrals,
      'Completed referrals',
    ),
    totalRewardWei: row.total_reward_wei,
    isCurrentWallet: row.is_current_wallet === true,
  };
}

function normalizeLeaderboardRow(
  row: LeaderboardMovementRow,
): PublicLeaderboardEntry {
  const base = normalizeBaseLeaderboardRow(row);
  const movement = row.rank_movement as RankMovement;

  if (!RANK_MOVEMENTS.has(movement)) {
    throw new Error('Leaderboard returned an invalid rank movement.');
  }

  const previousRank = row.previous_rank === null
    ? null
    : parseCount(row.previous_rank, 'Previous leaderboard rank');
  const rankChange = row.rank_change === null
    ? null
    : parseSignedInteger(row.rank_change, 'Leaderboard rank change');

  return {
    ...base,
    previousRank,
    rankChange,
    rankMovement: movement,
  };
}

function normalizeLegacyLeaderboardRow(
  row: LeaderboardRow,
): PublicLeaderboardEntry {
  return {
    ...normalizeBaseLeaderboardRow(row),
    previousRank: null,
    rankChange: null,
    rankMovement: 'UNAVAILABLE',
  };
}

function normalizeWallet(
  value: string | null,
): string | null | undefined {
  if (value === null || value.trim() === '') return null;

  const normalized = value.trim().toLowerCase();
  return WALLET_PATTERN.test(normalized) ? normalized : undefined;
}

function isTransientAuthClockSkew(
  error: unknown,
): boolean {
  if (!error || typeof error !== 'object') return false;

  const message = String(
    (error as { message?: unknown }).message ?? '',
  ).toLowerCase();

  return message.includes('jwt issued at future');
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function GET(
  request: NextRequest,
) {
  const wallet = normalizeWallet(
    request.nextUrl.searchParams.get('wallet'),
  );

  if (wallet === undefined) {
    return NextResponse.json(
      { error: 'Invalid wallet address.' },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const clientIp = getClientIpSubject(request);
  const limited = await enforceRateLimits([
    clientIp
      ? {
          scope: 'public_leaderboard_ip',
          subject: clientIp,
          limit: 120,
          windowSeconds: 60,
        }
      : null,
  ]);

  if (limited) {
    return limited;
  }

  try {
    const round = await readCurrentVeBetterRound();
    const comparisonRoundId =
      round.currentRoundId > 0
        ? round.currentRoundId - 1
        : null;

    const readLeaderboardWithMovement = () =>
      supabaseAdmin.rpc(
        'get_public_lifetime_leaderboard_v2',
        {
          p_network: round.network,
          p_wallet: wallet,
          p_limit: LEADERBOARD_SIZE,
          p_comparison_round_id: comparisonRoundId,
          p_ranking_algorithm_version: RANKING_ALGORITHM_VERSION,
        },
      );

    const readLegacyLeaderboard = () =>
      supabaseAdmin.rpc(
        'get_public_lifetime_leaderboard',
        {
          p_network: round.network,
          p_wallet: wallet,
          p_limit: LEADERBOARD_SIZE,
        },
      );

    const readComparison = () =>
      comparisonRoundId === null
        ? Promise.resolve({ data: [], error: null })
        : supabaseAdmin.rpc(
            'get_leaderboard_comparison_status',
            {
              p_network: round.network,
              p_round_id: comparisonRoundId,
              p_ranking_algorithm_version: RANKING_ALGORITHM_VERSION,
            },
          );

    const readGrowth = () =>
      supabaseAdmin.rpc(
        'get_operator_public_new_user_growth',
        {
          p_network: round.network,
          p_current_round_id: round.currentRoundId,
          p_limit: MAX_GROWTH_ROUNDS,
        },
      );

    let [leaderboardResult, comparisonResult, growthResult] =
      await Promise.all([
        readLeaderboardWithMovement(),
        readComparison(),
        readGrowth(),
      ]);

    if (
      isTransientAuthClockSkew(leaderboardResult.error) ||
      isTransientAuthClockSkew(comparisonResult.error) ||
      isTransientAuthClockSkew(growthResult.error)
    ) {
      await wait(TRANSIENT_AUTH_RETRY_MS);
      [leaderboardResult, comparisonResult, growthResult] =
        await Promise.all([
          readLeaderboardWithMovement(),
          readComparison(),
          readGrowth(),
        ]);
    }

    if (growthResult.error) {
      throw new Error(
        `Public growth totals could not be loaded: ${growthResult.error.message}`,
      );
    }

    let entries: PublicLeaderboardEntry[];

    if (leaderboardResult.error) {
      console.error(
        'Leaderboard movement read failed; falling back to the paid lifetime leaderboard:',
        leaderboardResult.error,
      );

      let fallbackResult = await readLegacyLeaderboard();
      if (isTransientAuthClockSkew(fallbackResult.error)) {
        await wait(TRANSIENT_AUTH_RETRY_MS);
        fallbackResult = await readLegacyLeaderboard();
      }
      if (fallbackResult.error) {
        throw new Error(
          `Public leaderboard could not be loaded: ${fallbackResult.error.message}`,
        );
      }

      entries = ((fallbackResult.data ?? []) as LeaderboardRow[])
        .map(normalizeLegacyLeaderboardRow);
    } else {
      entries = (
        (leaderboardResult.data ?? []) as LeaderboardMovementRow[]
      ).map(normalizeLeaderboardRow);
    }

    const rawComparison = comparisonResult.error
      ? null
      : ((comparisonResult.data ?? []) as ComparisonRow[])[0] ?? null;
    const comparisonAvailable = rawComparison?.comparison_available === true;

    if (comparisonResult.error) {
      console.error(
        'Leaderboard comparison metadata could not be loaded; movement is hidden:',
        comparisonResult.error,
      );
    }

    if (!comparisonAvailable) {
      entries = entries.map((entry) => ({
        ...entry,
        previousRank: null,
        rankChange: null,
        rankMovement: 'UNAVAILABLE' as const,
      }));
    }

    const growthRows = (
      (growthResult.data ?? []) as GrowthRow[]
    ).map((row) => ({
      roundId: parseCount(row.round_id, 'Growth round'),
      newUsers: parseCount(
        row.cumulative_activated_new_users,
        'Activated new users',
      ),
      returningUsers: parseCount(
        row.cumulative_activated_returning_users,
        'Activated returning users',
      ),
    }));

    const latestGrowth = growthRows.reduce<
      (typeof growthRows)[number] | null
    >(
      (latest, row) =>
        latest === null || row.roundId > latest.roundId
          ? row
          : latest,
      null,
    );

    const reportingStartRound =
      growthRows.length > 0
        ? Math.min(...growthRows.map((row) => row.roundId))
        : null;

    const response: PublicLeaderboardResponse = {
      generatedAt: new Date().toISOString(),
      network: round.network,
      currentRoundId: round.currentRoundId,
      reportingStartRound,
      comparison: {
        available: comparisonAvailable,
        roundId: comparisonRoundId,
        endBlock:
          comparisonAvailable && rawComparison?.comparison_end_block != null
            ? parseCount(rawComparison.comparison_end_block, 'Comparison end block')
            : null,
        publishedAt:
          comparisonAvailable
            ? rawComparison?.comparison_published_at ?? null
            : null,
        rankingAlgorithmVersion: RANKING_ALGORITHM_VERSION,
      },
      impact: {
        totalActivatedUsers:
          (latestGrowth?.newUsers ?? 0) +
          (latestGrowth?.returningUsers ?? 0),
        newUsers: latestGrowth?.newUsers ?? 0,
        returningUsers: latestGrowth?.returningUsers ?? 0,
      },
      leaders: entries.filter(
        (entry) => entry.rank <= LEADERBOARD_SIZE,
      ),
      currentUser:
        entries.find((entry) => entry.isCurrentWallet) ?? null,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': wallet
          ? 'private, no-store'
          : 'public, s-maxage=30, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error(
      'Public leaderboard request failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'The leaderboard is temporarily unavailable.',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
