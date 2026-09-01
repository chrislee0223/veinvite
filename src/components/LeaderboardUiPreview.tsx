'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { PublicLeaderboard } from './PublicLeaderboard';
import {
  localeFromLanguageTag,
  type Locale,
} from '@/lib/i18n/locales';
import type {
  PublicLeaderboardEntry,
  PublicLeaderboardResponse,
} from '@/lib/types';

const TEST_WALLET =
  '0x1234567890abcdef1234567890abcdef12345678';
const TOKEN_WEI = 10n ** 18n;

type PreviewScenario = 'inside' | 'outside';

function walletForRank(rank: number): string {
  return `0x${rank.toString(16).padStart(40, '0')}`;
}

function rewardWeiForRank(rank: number): string {
  return (BigInt(1300 - rank * 8) * TOKEN_WEI).toString();
}

function referralsForRank(rank: number): number {
  return Math.max(1, 18 - Math.floor((rank - 1) / 6));
}

function buildLeaders(
  scenario: PreviewScenario,
): PublicLeaderboardEntry[] {
  return Array.from({ length: 100 }, (_, index) => {
    const rank = index + 1;
    const current = scenario === 'inside' && rank === 37;

    return {
      rank,
      walletAddress: current ? TEST_WALLET : walletForRank(rank),
      completedReferrals: referralsForRank(rank),
      totalRewardWei: rewardWeiForRank(rank),
      isCurrentWallet: current,
    };
  });
}

function buildPreviewData(
  scenario: PreviewScenario,
): PublicLeaderboardResponse {
  const leaders = buildLeaders(scenario);
  const currentUser = scenario === 'inside'
    ? leaders.find((entry) => entry.isCurrentWallet) ?? null
    : {
        rank: 137,
        walletAddress: TEST_WALLET,
        completedReferrals: 1,
        totalRewardWei: (245n * TOKEN_WEI).toString(),
        isCurrentWallet: true,
      };

  return {
    generatedAt: '2026-09-01T12:00:00.000Z',
    network: 'mainnet',
    currentRoundId: 114,
    reportingStartRound: 113,
    impact: {
      totalActivatedUsers: 128,
      newUsers: 93,
      returningUsers: 35,
    },
    leaders,
    currentUser,
  };
}

function currentLocale(): Locale {
  return (
    localeFromLanguageTag(document.documentElement.lang) ?? 'en'
  );
}

export function LeaderboardUiPreview() {
  const [locale, setLocale] = useState<Locale>('en');
  const [scenario, setScenario] =
    useState<PreviewScenario>('inside');
  const previewData = useMemo(
    () => buildPreviewData(scenario),
    [scenario],
  );

  useEffect(() => {
    const sync = () => setLocale(currentLocale());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    });
    window.addEventListener('veinvite-language-change', sync);

    return () => {
      observer.disconnect();
      window.removeEventListener('veinvite-language-change', sync);
    };
  }, []);

  return (
    <section className="leaderboardPreview">
      <div className="previewHeading">
        <span>PRODUCTION LEADERBOARD</span>
        <h2>Top 100 리더보드 미리보기</h2>
        <p>
          실제 리더보드 컴포넌트에 가짜 데이터 100개를 넣은 화면입니다.
          별도 내부 스크롤 없이 페이지를 아래로 내려 100위까지 확인하고,
          내 순위가 100위 안과 밖일 때의 배치도 비교할 수 있어요.
        </p>

        <div className="scenarioToggle" aria-label="내 순위 테스트 상태">
          <button
            type="button"
            className={scenario === 'inside' ? 'selected' : ''}
            onClick={() => setScenario('inside')}
          >
            100위 안 · 37위
          </button>
          <button
            type="button"
            className={scenario === 'outside' ? 'selected' : ''}
            onClick={() => setScenario('outside')}
          >
            100위 밖 · 137위
          </button>
        </div>
      </div>

      <div className="previewFrame">
        <PublicLeaderboard
          locale={locale}
          wallet={TEST_WALLET}
          previewData={previewData}
        />
      </div>

      <style jsx>{`
        .leaderboardPreview {
          width:min(calc(100% - 32px),1120px);
          margin:28px auto 0;
          padding:22px;
          box-sizing:border-box;
          border:1px solid rgba(255,205,80,.16);
          border-radius:24px;
          background:#090907;
        }
        .previewHeading {
          width:min(100%,560px);
          margin:0 auto 22px;
        }
        .previewHeading > span {
          color:#f4b728;
          font-size:.68rem;
          font-weight:950;
          letter-spacing:.1em;
        }
        .previewHeading h2 {
          margin:7px 0 0;
          color:#f7f3e8;
          font-size:1.25rem;
          letter-spacing:-.03em;
        }
        .previewHeading p {
          margin:8px 0 0;
          color:#8f8a80;
          font-size:.76rem;
          line-height:1.6;
        }
        .scenarioToggle {
          margin-top:14px;
          padding:4px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:4px;
          border:1px solid rgba(255,255,255,.07);
          border-radius:14px;
          background:rgba(255,255,255,.025);
        }
        .scenarioToggle button {
          min-height:42px;
          padding:0 10px;
          border:1px solid transparent;
          border-radius:10px;
          background:transparent;
          color:#878279;
          font:inherit;
          font-size:.7rem;
          font-weight:900;
          cursor:pointer;
        }
        .scenarioToggle button.selected {
          border-color:rgba(255,205,80,.25);
          background:rgba(244,183,40,.1);
          color:#f3ca58;
        }
        .scenarioToggle button:focus-visible {
          outline:2px solid rgba(255,205,80,.7);
          outline-offset:2px;
        }
        .previewFrame {
          width:min(100%,560px);
          margin:0 auto;
        }
        @media (max-width:560px) {
          .leaderboardPreview {
            width:100%;
            margin-top:20px;
            padding:20px 16px;
            border-right:0;
            border-left:0;
            border-radius:0;
          }
        }
        @media (max-width:380px) {
          .scenarioToggle {
            grid-template-columns:1fr;
          }
        }
      `}</style>
    </section>
  );
}
