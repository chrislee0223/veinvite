import type { PublicCountryArrivalEntry } from './types';

export function attachCountryRankMovement(
  leaders: PublicCountryArrivalEntry[],
  previousRanks: ReadonlyMap<string, number> | null,
): PublicCountryArrivalEntry[] {
  return leaders.map((entry) => {
    // Unknown country is a synthetic aggregate, not a competing country.
    // If the historical comparison is unavailable, never fabricate movement.
    if (entry.countryCode === 'ZZ' || previousRanks === null) {
      return {
        ...entry,
        previousRank: null,
        rankChange: null,
        rankMovement: 'UNAVAILABLE',
      };
    }

    const previousRank = previousRanks.get(entry.countryCode) ?? null;
    if (previousRank === null) {
      return {
        ...entry,
        previousRank: null,
        rankChange: null,
        rankMovement: 'NEW',
      };
    }

    const rankChange = previousRank - entry.rank;
    return {
      ...entry,
      previousRank,
      rankChange,
      rankMovement:
        rankChange > 0 ? 'UP' : rankChange < 0 ? 'DOWN' : 'SAME',
    };
  });
}
