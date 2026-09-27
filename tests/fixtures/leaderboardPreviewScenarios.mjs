export const TEST_WALLET =
  '0x1234567890abcdef1234567890abcdef12345678';

export const LEADERBOARD_PREVIEW_SCENARIOS = [
  'inside',
  'outside',
  'unranked',
];

export const DEFAULT_LEADERBOARD_PREVIEW_SCENARIO =
  'unranked';

const TOKEN_WEI = 10n ** 18n;

function walletForRank(rank) {
  return `0x${rank
    .toString(16)
    .padStart(40, '0')}`;
}

function rewardWeiForRank(rank) {
  return (
    BigInt(1300 - rank * 8) *
    TOKEN_WEI
  ).toString();
}

function referralsForRank(rank) {
  return Math.max(
    1,
    18 - Math.floor((rank - 1) / 6),
  );
}

function movementForRank(rank) {
  if (rank === 1) {
    return {
      previousRank: 5,
      rankChange: 4,
      rankMovement: 'UP',
    };
  }

  if (rank === 2) {
    return {
      previousRank: 1,
      rankChange: -1,
      rankMovement: 'DOWN',
    };
  }

  if (rank === 3) {
    return {
      previousRank: 3,
      rankChange: 0,
      rankMovement: 'SAME',
    };
  }

  if (rank === 4) {
    return {
      previousRank: null,
      rankChange: null,
      rankMovement: 'NEW',
    };
  }

  if (rank === 5) {
    return {
      previousRank: 131,
      rankChange: 126,
      rankMovement: 'UP',
    };
  }

  return {
    previousRank: null,
    rankChange: null,
    rankMovement: 'UNAVAILABLE',
  };
}

function buildLeaders(scenario) {
  if (scenario === 'unranked') {
    return [];
  }

  return Array.from(
    { length: 100 },
    (_, index) => {
      const rank = index + 1;
      const current =
        scenario === 'inside' &&
        rank === 37;
      const movement = current
        ? {
            previousRank: 163,
            rankChange: 126,
            rankMovement: 'UP',
          }
        : movementForRank(rank);

      return {
        rank,
        walletAddress: current
          ? TEST_WALLET
          : walletForRank(rank),
        completedReferrals:
          referralsForRank(rank),
        totalRewardWei:
          rewardWeiForRank(rank),
        isCurrentWallet: current,
        ...movement,
      };
    },
  );
}

export function buildLeaderboardPreviewScenario(
  scenario,
) {
  if (
    !LEADERBOARD_PREVIEW_SCENARIOS.includes(
      scenario,
    )
  ) {
    throw new Error(
      `Unknown leaderboard preview scenario: ${scenario}`,
    );
  }

  const leaders =
    buildLeaders(scenario);
  const currentUser =
    scenario === 'inside'
      ? leaders.find(
          (entry) =>
            entry.isCurrentWallet,
        ) ?? null
      : scenario === 'outside'
        ? {
            rank: 137,
            walletAddress:
              TEST_WALLET,
            completedReferrals: 1,
            totalRewardWei: (
              245n * TOKEN_WEI
            ).toString(),
            isCurrentWallet: true,
            previousRank: 27,
            rankChange: -110,
            rankMovement: 'DOWN',
          }
        : null;

  return {
    generatedAt:
      '2026-09-05T12:00:00.000Z',
    network: 'mainnet',
    currentRoundId: 114,
    reportingStartRound: 113,
    comparison: {
      available:
        scenario !== 'unranked',
      roundId: 113,
      endBlock:
        scenario === 'unranked'
          ? null
          : 25762839,
      publishedAt:
        scenario === 'unranked'
          ? null
          : '2026-09-01T00:26:56.000Z',
      rankingAlgorithmVersion:
        'paid_referrals_v2',
    },
    impact: {
      totalActivatedUsers:
        scenario === 'unranked'
          ? 0
          : 128,
      newUsers:
        scenario === 'unranked'
          ? 0
          : 93,
      returningUsers:
        scenario === 'unranked'
          ? 0
          : 35,
    },
    leaders,
    currentUser,
  };
}
