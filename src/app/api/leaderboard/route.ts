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
} from '@/lib/types';
import { readVeBetterRoundWindow } from '@/lib/vebetter/entryEligibility';

export const dynamic = 'force-dynamic';

const WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const LEADERBOARD_SIZE = 5;
const MAX_GROWTH_ROUNDS = 260;
const TRANSIENT_AUTH_RETRY_MS = 750;

type LeaderboardRow = {
  rank_position: number | string;
  wallet_address: string;
  completed_referrals: number | string;
  total_reward_wei: string;
  is_current_wallet: boolean;
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

function normalizeLeaderboardRow(
  row: LeaderboardRow,
): PublicLeaderboardEntry {
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
    const round = await readVeBetterRoundWindow();

    const readLeaderboard = () =>
      supabaseAdmin.rpc(
        'get_public_lifetime_leaderboard',
        {
          p_network: round.network,
          p_wallet: wallet,
          p_limit: LEADERBOARD_SIZE,
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

    let [leaderboardResult, growthResult] =
      await Promise.all([
        readLeaderboard(),
        readGrowth(),
      ]);

    // Supabase can rarely reject a read when the request and auth clocks are
    // separated by a very small amount. Retry only that known transient,
    // read-only failure once. All other DB/auth errors remain fail-closed.
    if (
      isTransientAuthClockSkew(leaderboardResult.error) ||
      isTransientAuthClockSkew(growthResult.error)
    ) {
      await wait(TRANSIENT_AUTH_RETRY_MS);
      [leaderboardResult, growthResult] =
        await Promise.all([
          readLeaderboard(),
          readGrowth(),
        ]);
    }

    if (leaderboardResult.error) {
      throw new Error(
        `Public leaderboard could not be loaded: ${leaderboardResult.error.message}`,
      );
    }

    if (growthResult.error) {
      throw new Error(
        `Public growth totals could not be loaded: ${growthResult.error.message}`,
      );
    }

    const entries = (
      (leaderboardResult.data ?? []) as LeaderboardRow[]
    ).map(normalizeLeaderboardRow);

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
        'Cache-Control':
          'public, s-maxage=60, stale-while-revalidate=300',
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
