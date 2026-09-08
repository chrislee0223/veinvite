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
  PublicCountryArrivalEntry,
  PublicCountryArrivalResponse,
} from '@/lib/types';
import { readCurrentVeBetterRound } from '@/lib/vebetter/currentRound';

export const dynamic = 'force-dynamic';

const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const LEADERBOARD_SIZE = 100;

type CountryPayload = {
  knownCompleted?: unknown;
  unknownCompleted?: unknown;
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
      if (!COUNTRY_PATTERN.test(countryCode)) {
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

  return {
    knownCompleted,
    unknownCompleted,
    leaders,
  };
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
    const response: PublicCountryArrivalResponse = {
      generatedAt: new Date().toISOString(),
      network: round.network,
      currentRoundId: round.currentRoundId,
      ...normalized,
    };

    return NextResponse.json(response, {
      headers: {
        // Paid activation must become visible as soon as its finalized reward
        // receipt exists. Do not keep a stale country ranking at the edge.
        'Cache-Control': 'no-store',
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
