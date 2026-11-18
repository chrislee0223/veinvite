import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { normalizeIsoCountryCode } from '@/lib/countryCodes';
import { attachCountryRankMovement } from '@/lib/countryRankMovement';
import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import { supabaseAdmin } from '@/lib/supabaseServer';
import type {
  PublicCountryArrivalEntry,
  PublicCountryArrivalResponse,
} from '@/lib/types';
import { readCurrentVeBetterRound } from '@/lib/vebetter/currentRound';

export const dynamic = 'force-dynamic';

const UNKNOWN_COUNTRY_CODE = 'ZZ';
const LEADERBOARD_SIZE = 100;

type CountryPayload = {
  knownCompleted?: unknown;
  unknownCompleted?: unknown;
  unknownNewUsers?: unknown;
  unknownReturningUsers?: unknown;
  unknownCurrentRoundCompleted?: unknown;
  leaders?: unknown;
};

type CountryRow = {
  rank?: unknown;
  countryCode?: unknown;
  completedReferrals?: unknown;
  newUsers?: unknown;
  returningUsers?: unknown;
  currentRoundCompleted?: unknown;
};

function parseCount(value: unknown, field: string): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`${field} returned an invalid count.`);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${field} returned an invalid count.`);
  }
  return parsed;
}

function normalizePayload(value: unknown): {
  knownCompleted: number;
  unknownCompleted: number;
  leaders: PublicCountryArrivalEntry[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Country arrival data returned an invalid payload.');
  }

  const payload = value as CountryPayload;
  const leaders = (Array.isArray(payload.leaders) ? payload.leaders : []).map(
    (raw, index): PublicCountryArrivalEntry => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`Country arrival row ${index + 1} is invalid.`);
      }

      const row = raw as CountryRow;
      const countryCode = typeof row.countryCode === 'string'
        ? row.countryCode.trim().toUpperCase()
        : '';
      if (
        countryCode !== UNKNOWN_COUNTRY_CODE &&
        normalizeIsoCountryCode(countryCode) === null
      ) {
        throw new Error('Country arrival data returned an invalid country code.');
      }

      const completedReferrals = parseCount(
        row.completedReferrals,
        'Country completed referrals',
      );
      const newUsers = parseCount(row.newUsers, 'Country new users');
      const returningUsers = parseCount(
        row.returningUsers,
        'Country returning users',
      );

      if (newUsers + returningUsers !== completedReferrals) {
        throw new Error('Country arrival classification totals are inconsistent.');
      }

      return {
        rank: parseCount(row.rank, 'Country rank'),
        countryCode,
        completedReferrals,
        newUsers,
        returningUsers,
        currentRoundCompleted: parseCount(
          row.currentRoundCompleted,
          'Country current-round completions',
        ),
        previousRank: null,
        rankChange: null,
        rankMovement: 'UNAVAILABLE',
      };
    },
  );

  const knownCompleted = parseCount(
    payload.knownCompleted,
    'Known-country completed referrals',
  );
  const unknownCompleted = parseCount(
    payload.unknownCompleted,
    'Unknown-country completed referrals',
  );
  const leaderKnownTotal = leaders.reduce(
    (sum, row) => sum + row.completedReferrals,
    0,
  );

  if (leaders.length < LEADERBOARD_SIZE && leaderKnownTotal !== knownCompleted) {
    throw new Error('Country arrival coverage totals are inconsistent.');
  }

  if (unknownCompleted > 0) {
    const unknownNewUsers = parseCount(
      payload.unknownNewUsers,
      'Unknown-country new users',
    );
    const unknownReturningUsers = parseCount(
      payload.unknownReturningUsers,
      'Unknown-country returning users',
    );
    const unknownCurrentRoundCompleted = parseCount(
      payload.unknownCurrentRoundCompleted,
      'Unknown-country current-round completions',
    );

    if (unknownNewUsers + unknownReturningUsers !== unknownCompleted) {
      throw new Error('Unknown-country classification totals are inconsistent.');
    }

    const lastRank = leaders.reduce(
      (maximum, row) => Math.max(maximum, row.rank),
      0,
    );
    leaders.push({
      rank: lastRank + 1,
      countryCode: UNKNOWN_COUNTRY_CODE,
      completedReferrals: unknownCompleted,
      newUsers: unknownNewUsers,
      returningUsers: unknownReturningUsers,
      currentRoundCompleted: unknownCurrentRoundCompleted,
      previousRank: null,
      rankChange: null,
      rankMovement: 'UNAVAILABLE',
    });
  }

  return {
    knownCompleted,
    unknownCompleted,
    leaders,
  };
}

/**
 * A missing/invalid historical baseline must hide movement, never affect
 * the live country totals or produce misleading NEW arrows.
 */
function parsePreviousRanks(
  value: unknown,
  expectedRoundId: number,
): Map<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (payload.available !== true ||
      Number(payload.roundId) !== expectedRoundId ||
      !Array.isArray(payload.ranks)) {
    return null;
  }
  const ranks = new Map<string, number>();
  for (const item of payload.ranks) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const row = item as Record<string, unknown>;
    const countryCode = row.countryCode;
    const rank = Number(row.rank);
    if (typeof countryCode !== 'string' ||
        normalizeIsoCountryCode(countryCode) !== countryCode ||
        !Number.isSafeInteger(rank) || rank < 1 ||
        ranks.has(countryCode)) {
      return null;
    }
    ranks.set(countryCode, rank);
  }
  return ranks;
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIpSubject(request);
  const limited = await enforceRateLimits([
    clientIp
      ? {
          scope: 'public_country_leaderboard_ip',
          subject: clientIp,
          limit: 120,
          windowSeconds: 60,
        }
      : null,
  ]);

  if (limited) return limited;

  try {
    const round = await readCurrentVeBetterRound();
    const { data, error } = await supabaseAdmin.rpc(
      'get_public_country_leaderboard',
      {
        p_network: round.network,
        p_current_round_id: round.currentRoundId,
        p_limit: LEADERBOARD_SIZE,
      },
    );

    if (error) {
      throw new Error(
        `Country arrival data could not be loaded: ${error.message}`,
      );
    }

    const normalized = normalizePayload(data);

    let previousRanks: Map<string, number> | null = null;
    if (round.currentRoundId > 1) {
      try {
        const { data: comparison, error: comparisonError } =
          await supabaseAdmin.rpc(
            'get_public_country_previous_round_ranks',
            {
              p_network: round.network,
              p_previous_round_id: round.currentRoundId - 1,
            },
          );
        if (comparisonError) {
          throw comparisonError;
        }
        previousRanks = parsePreviousRanks(
          comparison,
          round.currentRoundId - 1,
        );
      } catch (comparisonError) {
        // Country totals remain live even when historical movement fails.
        console.error('Country rank movement unavailable:', comparisonError);
      }
    }

    const response: PublicCountryArrivalResponse = {
      generatedAt: new Date().toISOString(),
      network: round.network,
      currentRoundId: round.currentRoundId,
      ...normalized,
      leaders: attachCountryRankMovement(normalized.leaders, previousRanks),
    };

    return NextResponse.json(response, {
      headers: {
        // Public, identical for every visitor (no wallet/session fields).
        // Keep the browser in sync with its local on-demand 30-minute cache,
        // while one CDN result per region serves repeated visitors without
        // rerunning the public + historical ranking Supabase RPCs.
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=1800',
      },
    });
  } catch (error) {
    console.error('Public country arrival request failed:', error);
    return NextResponse.json(
      { error: 'Country arrivals are temporarily unavailable.' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
