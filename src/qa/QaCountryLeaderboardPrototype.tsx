'use client';

import { useMemo, useState } from 'react';

import { AppBottomNavigation } from '@/components/AppBottomNavigation';
import { Brand } from '@/components/Brand';
import { PublicLeaderboard } from '@/components/PublicLeaderboard';
import { QaWalletLauncherOverrideProvider } from '@/components/WalletControl';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import { LEADERBOARD_COPY } from '@/lib/i18n/leaderboardCopy';
import {
  LANGUAGE_OPTIONS,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import type {
  PublicLeaderboardEntry,
  PublicLeaderboardResponse,
} from '@/lib/types';

const QA_WALLET = '0x0000000000000000000000000000000000000a11';
const B3TR = 10n ** 18n;

type RankingView = 'inviter' | 'country';
type CountryScope = 'round' | 'lifetime';

type CountryRow = {
  countryCode: string;
  count: number;
};

const ROUND_ROWS: CountryRow[] = [
  { countryCode: 'TR', count: 3 },
  { countryCode: 'JP', count: 2 },
  { countryCode: 'DE', count: 1 },
];

const LIFETIME_ROWS: CountryRow[] = [
  { countryCode: 'TR', count: 6 },
  { countryCode: 'JP', count: 4 },
  { countryCode: 'DE', count: 3 },
  { countryCode: 'KR', count: 2 },
  { countryCode: 'VN', count: 1 },
  { countryCode: 'NL', count: 1 },
];

const COPY = {
  ko: {
    inviter: '초대자 랭킹',
    country: '국가별 유입',
    round: '이번 라운드',
    lifetime: '누적',
    completeUsers: '완료 유입',
    coverage: '국가 확인 가능',
    unknown: '국가 미확인',
    basis: '미션 전체 완료 및 검증 통과 기준',
    qaBadge: 'QA 미리보기',
  },
  en: {
    inviter: 'Inviter ranking',
    country: 'Country arrivals',
    round: 'This round',
    lifetime: 'All time',
    completeUsers: 'Completed',
    coverage: 'Country identified',
    unknown: 'Country unknown',
    basis: 'Counts fully completed and verified referrals',
    qaBadge: 'QA preview',
  },
} as const;

function previewCopy(locale: SupportedLocale) {
  return locale === 'ko' ? COPY.ko : COPY.en;
}

function countryFlag(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (character) =>
      String.fromCodePoint(127397 + character.charCodeAt(0)),
    );
}

function countryName(countryCode: string, locale: SupportedLocale): string {
  try {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    return names.of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

function rewardEntry({
  rank,
  walletAddress,
  referrals,
  reward,
  current = false,
}: {
  rank: number;
  walletAddress: string;
  referrals: number;
  reward: number;
  current?: boolean;
}): PublicLeaderboardEntry {
  return {
    rank,
    walletAddress,
    completedReferrals: referrals,
    totalRewardWei: (BigInt(reward) * B3TR).toString(),
    isCurrentWallet: current,
    previousRank: rank,
    rankChange: 0,
    rankMovement: 'SAME',
  };
}

function inviterPreviewData(): PublicLeaderboardResponse {
  const leaders = [
    rewardEntry({
      rank: 1,
      walletAddress: '0x0000000000000000000000000000000000000b01',
      referrals: 8,
      reward: 720,
    }),
    rewardEntry({
      rank: 2,
      walletAddress: QA_WALLET,
      referrals: 6,
      reward: 510,
      current: true,
    }),
    rewardEntry({
      rank: 3,
      walletAddress: '0x0000000000000000000000000000000000000b02',
      referrals: 5,
      reward: 410,
    }),
    rewardEntry({
      rank: 4,
      walletAddress: '0x0000000000000000000000000000000000000b03',
      referrals: 3,
      reward: 260,
    }),
  ];

  return {
    generatedAt: '2026-09-07T12:00:00.000Z',
    network: 'mainnet',
    currentRoundId: 114,
    reportingStartRound: 110,
    comparison: {
      available: true,
      roundId: 113,
      endBlock: 22222222,
      publishedAt: '2026-09-06T23:00:00.000Z',
      rankingAlgorithmVersion: 'qa-country-preview-v1',
    },
    impact: {
      totalActivatedUsers: 20,
      newUsers: 13,
      returningUsers: 7,
    },
    leaders,
    currentUser: leaders.find((entry) => entry.isCurrentWallet) ?? null,
  };
}

export function QaCountryLeaderboardPrototype() {
  const [locale, setLocale] = useState<SupportedLocale>('ko');
  const [rankingView, setRankingView] = useState<RankingView>('country');
  const [scope, setScope] = useState<CountryScope>('round');

  const homeCopy = HOME_COPY[locale];
  const leaderboardCopy = LEADERBOARD_COPY[locale];
  const copy = previewCopy(locale);
  const inviterData = useMemo(() => inviterPreviewData(), []);

  const countryRows = scope === 'round' ? ROUND_ROWS : LIFETIME_ROWS;
  const knownCount = countryRows.reduce((sum, row) => sum + row.count, 0);
  const unknownCount = scope === 'round' ? 1 : 4;
  const totalCount = knownCount + unknownCount;

  return (
    <QaWalletLauncherOverrideProvider value={{ wallet: QA_WALLET }}>
      <main className="screen">
        <header className="topBar">
          <Brand />
          <div className="topActions">
            <div className="utilityActions">
              <button
                type="button"
                className="notificationPreview"
                aria-label="Notifications"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </button>
              <select
                className="languageSelect"
                value={locale}
                onChange={(event) =>
                  setLocale(event.target.value as SupportedLocale)
                }
                aria-label={homeCopy.languageAria}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.locale} value={option.locale}>
                    {option.nativeName}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="accountChip">
              <span className="accountDot" />
              0x0000···0a11
            </button>
          </div>
        </header>

        <section className="leaderboardPrototype">
          <section className="impactCard">
            <div className="qaLabel">{copy.qaBadge}</div>
            <h2>{leaderboardCopy.impactTitle}</h2>
            <button type="button" className="impactSummaryButton">
              <span>{leaderboardCopy.totalUsers}</span>
              <strong>{totalCount}</strong>
              <b aria-hidden="true">›</b>
            </button>
            <p className="impactNote">{leaderboardCopy.impactNote}</p>
          </section>

          <div className="rankingViewSwitch" role="tablist" aria-label="Ranking view">
            <button
              type="button"
              role="tab"
              aria-selected={rankingView === 'inviter'}
              className={rankingView === 'inviter' ? 'active' : ''}
              onClick={() => setRankingView('inviter')}
            >
              <span className="viewIcon" aria-hidden="true">♙</span>
              {copy.inviter}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rankingView === 'country'}
              className={rankingView === 'country' ? 'active' : ''}
              onClick={() => setRankingView('country')}
            >
              <span className="viewIcon" aria-hidden="true">◎</span>
              {copy.country}
            </button>
          </div>

          {rankingView === 'inviter' ? (
            <div className="existingLeaderboard">
              <PublicLeaderboard
                locale={locale}
                wallet={QA_WALLET}
                previewData={inviterData}
              />
            </div>
          ) : (
            <section className="countryRankingCard">
              <div className="scopeSwitch" role="tablist" aria-label="Country ranking period">
                <button
                  type="button"
                  role="tab"
                  aria-selected={scope === 'round'}
                  className={scope === 'round' ? 'active' : ''}
                  onClick={() => setScope('round')}
                >
                  {copy.round}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scope === 'lifetime'}
                  className={scope === 'lifetime' ? 'active' : ''}
                  onClick={() => setScope('lifetime')}
                >
                  {copy.lifetime}
                </button>
              </div>

              <div className="coverageLine">
                <span>{copy.coverage}</span>
                <strong>{knownCount} / {totalCount}</strong>
              </div>

              <div className="countryHeader" aria-hidden="true">
                <span>{leaderboardCopy.rank}</span>
                <span>{copy.country}</span>
                <span>{copy.completeUsers}</span>
              </div>

              <div className="countryScroll">
                <div className="countryRows">
                  {countryRows.map((row, index) => (
                    <div className="countryRow" key={row.countryCode}>
                      <strong className="countryRank">{index + 1}</strong>
                      <div className="countryIdentity">
                        <span className="flag" aria-hidden="true">
                          {countryFlag(row.countryCode)}
                        </span>
                        <span className="countryText">
                          {countryName(row.countryCode, locale)}
                        </span>
                      </div>
                      <strong className="countryCount">{row.count}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="unknownRow">
                <span className="unknownIcon" aria-hidden="true">?</span>
                <span>{copy.unknown}</span>
                <strong>{unknownCount}</strong>
              </div>

              <p className="countryBasis">{copy.basis}</p>
            </section>
          )}
        </section>

        <AppBottomNavigation
          activeTab="leaderboard"
          locale={locale}
          onChange={() => {}}
        />
      </main>

      <style jsx global>{`
        .existingLeaderboard .leaderboardPage > .impactCard {
          display: none !important;
        }
        .existingLeaderboard .leaderboardPage > .rankingCard {
          margin-top: 0 !important;
        }
      `}</style>

      <style jsx>{`
        .screen {
          min-height: 100svh;
          box-sizing: border-box;
          padding: 22px 18px 118px;
          color: #fff;
          background:
            radial-gradient(circle at 50% 16%, rgba(244,183,40,.14), transparent 32%),
            #080807;
        }
        .topBar {
          width: min(100%,520px);
          margin: 0 auto 26px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .topActions {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .utilityActions {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .notificationPreview {
          width: 38px;
          height: 38px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,205,80,.14);
          border-radius: 13px;
          background: rgba(255,255,255,.035);
          color: #d7d1c4;
        }
        .languageSelect {
          min-height: 38px;
          max-width: 96px;
          padding: 0 28px 0 10px;
          border: 1px solid rgba(255,205,80,.14);
          border-radius: 13px;
          background: rgba(255,255,255,.035);
          color: #d7d1c4;
          font: inherit;
          font-size: .67rem;
          font-weight: 800;
        }
        .languageSelect option {
          color: #111;
        }
        .accountChip {
          min-height: 38px;
          padding: 0 11px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(255,205,80,.16);
          border-radius: 13px;
          background: rgba(255,255,255,.035);
          color: #d9d4c8;
          font: inherit;
          font-size: .65rem;
          font-weight: 850;
        }
        .accountDot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #7adf8d;
          box-shadow: 0 0 0 3px rgba(122,223,141,.08);
        }
        .leaderboardPrototype {
          width: min(100%,520px);
          margin: 0 auto;
          padding-bottom: 12px;
        }
        .impactCard,
        .countryRankingCard {
          padding: 18px;
          border: 1px solid rgba(255,205,80,.14);
          border-radius: 21px;
          background: rgba(255,255,255,.035);
        }
        .impactCard {
          position: relative;
        }
        .qaLabel {
          position: absolute;
          top: 15px;
          right: 16px;
          color: #6f6a61;
          font-size: .56rem;
          font-weight: 850;
          letter-spacing: .04em;
        }
        h2 {
          margin: 0;
          font-size: 1rem;
          letter-spacing: -.02em;
        }
        .impactSummaryButton {
          width: 100%;
          min-height: 104px;
          margin-top: 14px;
          padding: 16px 18px;
          display: grid;
          grid-template-columns: 1fr auto;
          grid-template-rows: auto 1fr;
          align-items: center;
          gap: 4px 12px;
          border: 1px solid rgba(255,205,80,.16);
          border-radius: 17px;
          background: linear-gradient(135deg,rgba(244,183,40,.11),rgba(255,255,255,.025));
          color: #f8f4e8;
          text-align: left;
          cursor: pointer;
        }
        .impactSummaryButton span {
          color: #928c80;
          font-size: .7rem;
          font-weight: 850;
        }
        .impactSummaryButton strong {
          grid-row: 2;
          color: #ffd35c;
          font-size: 2rem;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .impactSummaryButton b {
          grid-column: 2;
          grid-row: 1 / span 2;
          color: #d9b956;
          font-size: 1.55rem;
          font-weight: 500;
        }
        .impactNote {
          margin: 11px 2px 0;
          color: #817c73;
          font-size: .7rem;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }
        .rankingViewSwitch {
          margin-top: 14px;
          padding: 4px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          border: 1px solid rgba(255,205,80,.13);
          border-radius: 17px;
          background: rgba(255,255,255,.028);
        }
        .rankingViewSwitch button,
        .scopeSwitch button {
          border: 0;
          font: inherit;
          cursor: pointer;
          transition: background-color 140ms ease, color 140ms ease, transform 90ms ease;
        }
        .rankingViewSwitch button {
          min-height: 46px;
          padding: 0 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border-radius: 13px;
          background: transparent;
          color: #7d786f;
          font-size: .72rem;
          font-weight: 900;
        }
        .rankingViewSwitch button.active {
          background: rgba(255,201,61,.1);
          color: #ffd45f;
          box-shadow: inset 0 0 0 1px rgba(255,205,80,.12);
        }
        .viewIcon {
          font-size: .9rem;
          line-height: 1;
        }
        .existingLeaderboard,
        .countryRankingCard {
          margin-top: 14px;
        }
        .countryRankingCard {
          padding: 14px 14px 12px;
        }
        .scopeSwitch {
          padding: 3px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3px;
          border-radius: 13px;
          background: rgba(255,255,255,.035);
        }
        .scopeSwitch button {
          min-height: 36px;
          border-radius: 10px;
          background: transparent;
          color: #777269;
          font-size: .66rem;
          font-weight: 900;
        }
        .scopeSwitch button.active {
          background: rgba(244,183,40,.11);
          color: #f4c85a;
        }
        .coverageLine {
          min-height: 40px;
          padding: 3px 11px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #777269;
          font-size: .62rem;
          font-weight: 850;
        }
        .coverageLine strong {
          color: #a49e93;
          font-variant-numeric: tabular-nums;
        }
        .countryHeader,
        .countryRow {
          display: grid;
          grid-template-columns: 50px minmax(0,1fr) 82px;
          column-gap: 10px;
          align-items: center;
        }
        .countryHeader {
          min-height: 34px;
          padding: 0 12px 9px;
          border-bottom: 1px solid rgba(255,205,80,.09);
          color: #777269;
          font-size: .61rem;
          font-weight: 900;
        }
        .countryHeader span {
          min-width: 0;
          text-align: center;
        }
        .countryScroll {
          max-height: calc(56px * 5);
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          scrollbar-width: thin;
          scrollbar-color: rgba(244,183,40,.45) transparent;
        }
        .countryScroll::-webkit-scrollbar {
          width: 5px;
        }
        .countryScroll::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: rgba(244,183,40,.45);
        }
        .countryRows {
          display: grid;
        }
        .countryRow {
          min-height: 56px;
          padding: 0 12px;
          border-bottom: 1px solid rgba(255,255,255,.055);
          color: #e9e5dc;
        }
        .countryRank {
          text-align: center;
          color: #bdb7ac;
          font-size: .78rem;
          font-variant-numeric: tabular-nums;
        }
        .countryIdentity {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .flag {
          width: 31px;
          height: 31px;
          flex: 0 0 31px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 10px;
          background: rgba(255,255,255,.035);
          font-size: 1.02rem;
        }
        .countryText {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: .76rem;
          font-weight: 850;
        }
        .countryCount {
          text-align: center;
          color: #ffd35c;
          font-size: .84rem;
          font-variant-numeric: tabular-nums;
        }
        .unknownRow {
          min-height: 48px;
          margin-top: 6px;
          padding: 0 12px;
          display: grid;
          grid-template-columns: 31px 1fr auto;
          align-items: center;
          gap: 10px;
          border-radius: 12px;
          background: rgba(255,255,255,.025);
          color: #777269;
          font-size: .66rem;
          font-weight: 850;
        }
        .unknownIcon {
          width: 27px;
          height: 27px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 9px;
          color: #8e887e;
        }
        .unknownRow strong {
          color: #999388;
          font-size: .76rem;
        }
        .countryBasis {
          margin: 10px 2px 2px;
          color: #68645d;
          font-size: .6rem;
          line-height: 1.5;
          text-align: center;
        }
        @media (max-width: 430px) {
          .screen {
            padding-right: 14px;
            padding-left: 14px;
          }
          .topBar {
            gap: 10px;
          }
          .topActions {
            gap: 6px;
          }
          .accountChip {
            max-width: 106px;
            overflow: hidden;
            white-space: nowrap;
          }
          .languageSelect {
            max-width: 78px;
          }
          .countryHeader,
          .countryRow {
            grid-template-columns: 42px minmax(0,1fr) 72px;
            column-gap: 8px;
          }
          .countryHeader,
          .countryRow {
            padding-right: 8px;
            padding-left: 8px;
          }
        }
        @media (max-width: 360px) {
          .accountChip {
            display: none;
          }
          .rankingViewSwitch button {
            font-size: .65rem;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rankingViewSwitch button,
          .scopeSwitch button {
            transition: none;
          }
        }
      `}</style>
    </QaWalletLauncherOverrideProvider>
  );
}
