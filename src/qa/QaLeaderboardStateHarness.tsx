'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { PublicLeaderboard } from '@/components/PublicLeaderboard';
import type { SupportedLocale } from '@/lib/i18n/locales';
import type {
  PublicLeaderboardEntry,
  PublicLeaderboardResponse,
  RankMovement,
} from '@/lib/types';

export type QaLeaderboardStateId =
  | 'LEADERBOARD-LOADING'
  | 'LEADERBOARD-ERROR'
  | 'LEADERBOARD-LIST'
  | 'LEADERBOARD-PLACEHOLDERS'
  | 'LEADERBOARD-CURRENT-IN-LIST'
  | 'LEADERBOARD-CURRENT-TRAILING'
  | 'LEADERBOARD-MOVE-UP'
  | 'LEADERBOARD-MOVE-DOWN'
  | 'LEADERBOARD-MOVE-NEW'
  | 'LEADERBOARD-MOVE-SAME'
  | 'LEADERBOARD-WALLET-DETAIL'
  | 'LEADERBOARD-IMPACT-DETAIL';

const QA_WALLET = '0x0000000000000000000000000000000000000a11';
const QA_OTHER_A = '0x0000000000000000000000000000000000000b01';
const QA_OTHER_B = '0x0000000000000000000000000000000000000b02';
const QA_OTHER_C = '0x0000000000000000000000000000000000000b03';
const B3TR = 10n ** 18n;

function entry({
  rank,
  walletAddress,
  referrals,
  reward,
  current = false,
  movement = 'SAME',
  change = 0,
}: {
  rank: number;
  walletAddress: string;
  referrals: number;
  reward: number;
  current?: boolean;
  movement?: RankMovement;
  change?: number | null;
}): PublicLeaderboardEntry {
  return {
    rank,
    walletAddress,
    completedReferrals: referrals,
    totalRewardWei: (BigInt(reward) * B3TR).toString(),
    isCurrentWallet: current,
    previousRank:
      movement === 'NEW' || movement === 'UNAVAILABLE'
        ? null
        : rank + (change ?? 0),
    rankChange: movement === 'NEW' || movement === 'UNAVAILABLE' ? null : change,
    rankMovement: movement,
  };
}

function response(
  leaders: PublicLeaderboardEntry[],
  currentUser: PublicLeaderboardEntry | null,
): PublicLeaderboardResponse {
  return {
    generatedAt: '2026-09-06T05:00:00.000Z',
    network: 'mainnet',
    currentRoundId: 114,
    reportingStartRound: 110,
    comparison: {
      available: true,
      roundId: 113,
      endBlock: 22222222,
      publishedAt: '2026-09-05T23:00:00.000Z',
      rankingAlgorithmVersion: 'qa-v1',
    },
    impact: {
      totalActivatedUsers: 191,
      newUsers: 121,
      returningUsers: 70,
    },
    leaders,
    currentUser,
  };
}

function baseLeaders(): PublicLeaderboardEntry[] {
  return [
    entry({ rank: 1, walletAddress: QA_OTHER_A, referrals: 12, reward: 920, movement: 'SAME' }),
    entry({ rank: 2, walletAddress: QA_WALLET, referrals: 9, reward: 680, current: true, movement: 'UP', change: 2 }),
    entry({ rank: 3, walletAddress: QA_OTHER_B, referrals: 7, reward: 510, movement: 'DOWN', change: -1 }),
    entry({ rank: 4, walletAddress: QA_OTHER_C, referrals: 5, reward: 360, movement: 'NEW' }),
  ];
}

function dataForState(stateId: QaLeaderboardStateId): PublicLeaderboardResponse | undefined {
  if (stateId === 'LEADERBOARD-LOADING' || stateId === 'LEADERBOARD-ERROR') return undefined;

  if (stateId === 'LEADERBOARD-PLACEHOLDERS') {
    const first = entry({ rank: 1, walletAddress: QA_OTHER_A, referrals: 2, reward: 100, movement: 'SAME' });
    return response([first], null);
  }

  if (stateId === 'LEADERBOARD-CURRENT-TRAILING') {
    const trailing = entry({
      rank: 137,
      walletAddress: QA_WALLET,
      referrals: 1,
      reward: 40,
      current: true,
      movement: 'UP',
      change: 8,
    });
    return response(baseLeaders().filter((item) => !item.isCurrentWallet), trailing);
  }

  const movementByState: Partial<Record<QaLeaderboardStateId, { movement: RankMovement; change: number | null }>> = {
    'LEADERBOARD-MOVE-UP': { movement: 'UP', change: 3 },
    'LEADERBOARD-MOVE-DOWN': { movement: 'DOWN', change: -2 },
    'LEADERBOARD-MOVE-NEW': { movement: 'NEW', change: null },
    'LEADERBOARD-MOVE-SAME': { movement: 'SAME', change: 0 },
  };
  const movement = movementByState[stateId];
  const leaders = baseLeaders();

  if (movement) {
    leaders[1] = entry({
      rank: 2,
      walletAddress: QA_WALLET,
      referrals: 9,
      reward: 680,
      current: true,
      movement: movement.movement,
      change: movement.change,
    });
  }

  const current = leaders.find((item) => item.isCurrentWallet) ?? null;
  return response(leaders, current);
}

function pendingResponse(): Promise<Response> {
  return new Promise<Response>(() => {});
}

export function QaLeaderboardStateHarness({
  stateId,
  locale,
}: {
  stateId: QaLeaderboardStateId;
  locale: SupportedLocale;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [installed, setInstalled] = useState(false);
  const previewData = useMemo(() => dataForState(stateId), [stateId]);
  const networkState = stateId === 'LEADERBOARD-LOADING' || stateId === 'LEADERBOARD-ERROR';

  useLayoutEffect(() => {
    if (!networkState) {
      setInstalled(true);
      return;
    }

    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const url = new URL(rawUrl, window.location.origin);

      if (url.origin === window.location.origin && url.pathname === '/api/leaderboard') {
        if (stateId === 'LEADERBOARD-LOADING') return pendingResponse();
        return new Response(JSON.stringify({ error: 'QA leaderboard failure.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return originalFetch(input, init);
    };
    setInstalled(true);
    return () => {
      window.fetch = originalFetch;
    };
  }, [networkState, stateId]);

  useEffect(() => {
    if (!installed) return;
    if (stateId !== 'LEADERBOARD-WALLET-DETAIL' && stateId !== 'LEADERBOARD-IMPACT-DETAIL') return;

    let frame = 0;
    let requestId = 0;
    let cancelled = false;
    const attempt = () => {
      if (cancelled) return;
      const selector = stateId === 'LEADERBOARD-IMPACT-DETAIL'
        ? '.impactSummaryButton'
        : 'button.rankRow:not(.placeholderRow)';
      const button = rootRef.current?.querySelector<HTMLButtonElement>(selector);
      if (button && !button.disabled) {
        button.click();
        return;
      }
      frame += 1;
      if (frame < 120) requestId = window.requestAnimationFrame(attempt);
    };
    requestId = window.requestAnimationFrame(attempt);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(requestId);
    };
  }, [installed, stateId]);

  if (!installed) return null;

  return (
    <div
      ref={rootRef}
      data-qa-leaderboard-state={stateId}
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '22px 18px 118px',
        background: '#080807',
        color: '#fff',
      }}
    >
      <PublicLeaderboard
        locale={locale}
        wallet={QA_WALLET}
        previewData={previewData}
      />
    </div>
  );
}
