'use client';

import { useMemo, useState } from 'react';

import { AppBottomNavigation } from '@/components/AppBottomNavigation';
import { Brand } from '@/components/Brand';
import { PublicLeaderboard } from '@/components/PublicLeaderboard';
import { QaWalletLauncherOverrideProvider } from '@/components/WalletControl';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import { LEADERBOARD_COPY } from '@/lib/i18n/leaderboardCopy';
import { LANGUAGE_OPTIONS, type SupportedLocale } from '@/lib/i18n/locales';
import type { PublicLeaderboardEntry, PublicLeaderboardResponse } from '@/lib/types';

const QA_WALLET = '0x0000000000000000000000000000000000000a11';
const B3TR = 10n ** 18n;

type RankingView = 'inviter' | 'country';
type CountryRow = {
  countryCode: string;
  total: number;
  roundGain: number;
};

const COUNTRY_ROWS: CountryRow[] = [
  { countryCode: 'TR', total: 6, roundGain: 2 },
  { countryCode: 'JP', total: 4, roundGain: 1 },
  { countryCode: 'DE', total: 3, roundGain: 0 },
  { countryCode: 'KR', total: 2, roundGain: 1 },
  { countryCode: 'VN', total: 1, roundGain: 0 },
  { countryCode: 'NL', total: 1, roundGain: 0 },
];

const COPY = {
  ko: {
    inviter: '초대자 랭킹',
    country: '국가별 유입',
    completeUsers: '완료 유입',
    coverage: '국가 확인',
    unknown: '미확인',
    thisRound: '이번 라운드',
    qaBadge: 'QA 미리보기',
  },
  en: {
    inviter: 'Inviter ranking',
    country: 'Country arrivals',
    completeUsers: 'Completed',
    coverage: 'Country known',
    unknown: 'Unknown',
    thisRound: 'this round',
    qaBadge: 'QA preview',
  },
} as const;

function copyFor(locale: SupportedLocale) {
  return locale === 'ko' ? COPY.ko : COPY.en;
}

function countryName(code: string, locale: SupportedLocale) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function rewardEntry(
  rank: number,
  walletAddress: string,
  referrals: number,
  reward: number,
  current = false,
): PublicLeaderboardEntry {
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
    rewardEntry(1, '0x0000000000000000000000000000000000000b01', 8, 720),
    rewardEntry(2, QA_WALLET, 6, 510, true),
    rewardEntry(3, '0x0000000000000000000000000000000000000b02', 5, 410),
    rewardEntry(4, '0x0000000000000000000000000000000000000b03', 3, 260),
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
      rankingAlgorithmVersion: 'qa-country-preview-v3',
    },
    impact: {
      totalActivatedUsers: 21,
      newUsers: 14,
      returningUsers: 7,
    },
    leaders,
    currentUser: leaders[1],
  };
}

export function QaCountryLeaderboardPrototypeV3() {
  const [locale, setLocale] = useState<SupportedLocale>('ko');
  const [rankingView, setRankingView] = useState<RankingView>('country');
  const homeCopy = HOME_COPY[locale];
  const leaderboardCopy = LEADERBOARD_COPY[locale];
  const copy = copyFor(locale);
  const inviterData = useMemo(() => inviterPreviewData(), []);

  const knownCount = COUNTRY_ROWS.reduce((sum, row) => sum + row.total, 0);
  const unknownCount = 4;
  const totalCount = knownCount + unknownCount;

  return (
    <QaWalletLauncherOverrideProvider value={{ wallet: QA_WALLET }}>
      <main className="screen">
        <header className="topBar">
          <Brand />
          <div className="topActions">
            <button type="button" className="bell" aria-label="Notifications">
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
              onChange={(event) => setLocale(event.target.value as SupportedLocale)}
              aria-label={homeCopy.languageAria}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.locale} value={option.locale}>
                  {option.nativeName}
                </option>
              ))}
            </select>
            <button type="button" className="accountChip">
              <span />
              0x0000···0a11
            </button>
          </div>
        </header>

        <section className="content">
          <section className="impactCard">
            <div className="qaLabel">{copy.qaBadge}</div>
            <h2>{leaderboardCopy.impactTitle}</h2>
            <button type="button" className="impactSummaryButton">
              <span>{leaderboardCopy.totalUsers}</span>
              <strong>{totalCount}</strong>
              <b aria-hidden="true">›</b>
            </button>
            <p>{leaderboardCopy.impactNote}</p>
          </section>

          <section className="unifiedRankingCard">
            <div className="rankingTabs" role="tablist" aria-label="Ranking view">
              <button
                type="button"
                role="tab"
                aria-selected={rankingView === 'inviter'}
                className={rankingView === 'inviter' ? 'active' : ''}
                onClick={() => setRankingView('inviter')}
              >
                <span aria-hidden="true">♙</span>
                {copy.inviter}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rankingView === 'country'}
                className={rankingView === 'country' ? 'active' : ''}
                onClick={() => setRankingView('country')}
              >
                <span aria-hidden="true">◎</span>
                {copy.country}
              </button>
            </div>

            <div className="rankingMeta" aria-live="polite">
              {rankingView === 'inviter' ? (
                <>
                  <span>TOP 100</span>
                  <span aria-hidden="true">&nbsp;</span>
                </>
              ) : (
                <>
                  <span>{copy.coverage} {knownCount} / {totalCount}</span>
                  <span>{copy.unknown} {unknownCount}</span>
                </>
              )}
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
              <div className="countryPanel">
                <div className="countryHeader" aria-hidden="true">
                  <span>{leaderboardCopy.rank}</span>
                  <span>{copy.country}</span>
                  <span>{copy.completeUsers}</span>
                </div>
                <div className="countryScroll">
                  {COUNTRY_ROWS.map((row, index) => (
                    <div className="countryRow" key={row.countryCode}>
                      <strong className="rank">{index + 1}</strong>
                      <div className="identity">
                        <span className="countryCode" aria-hidden="true">
                          {row.countryCode}
                        </span>
                        <div className="countryCopy">
                          <strong>{countryName(row.countryCode, locale)}</strong>
                          {row.roundGain > 0 ? (
                            <small>+{row.roundGain} {copy.thisRound}</small>
                          ) : null}
                        </div>
                      </div>
                      <strong className="total">{row.total}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
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
        .existingLeaderboard .leaderboardPage {
          width: 100% !important;
          padding-bottom: 0 !important;
        }
        .existingLeaderboard .leaderboardPage > .rankingCard {
          margin-top: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
        }
        .existingLeaderboard .rankScroll {
          max-height: 200px !important;
        }
        .existingLeaderboard .rankContextNote,
        .existingLeaderboard .leaderboardInlineError {
          display: none !important;
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
        .topBar,
        .content {
          width: min(100%,520px);
          margin: 0 auto;
        }
        .topBar {
          margin-bottom: 26px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        .topActions {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .bell,
        .languageSelect,
        .accountChip {
          min-height: 38px;
          border: 1px solid rgba(255,205,80,.14);
          border-radius: 13px;
          background: rgba(255,255,255,.035);
          color: #d7d1c4;
        }
        .bell {
          width: 38px;
          display: grid;
          place-items: center;
        }
        .languageSelect {
          max-width: 88px;
          padding: 0 25px 0 9px;
          font: inherit;
          font-size: .65rem;
          font-weight: 800;
        }
        .languageSelect option {
          color: #111;
        }
        .accountChip {
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font: inherit;
          font-size: .63rem;
          font-weight: 850;
        }
        .accountChip span {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #7adf8d;
        }
        .impactCard,
        .unifiedRankingCard {
          border: 1px solid rgba(255,205,80,.14);
          border-radius: 21px;
          background: rgba(255,255,255,.035);
        }
        .impactCard {
          position: relative;
          padding: 18px;
        }
        .qaLabel {
          position: absolute;
          top: 15px;
          right: 16px;
          color: #6f6a61;
          font-size: .56rem;
          font-weight: 850;
        }
        h2 {
          margin: 0;
          font-size: 1rem;
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
        }
        .impactSummaryButton b {
          grid-column: 2;
          grid-row: 1 / span 2;
          color: #d9b956;
          font-size: 1.55rem;
          font-weight: 500;
        }
        .impactCard > p {
          margin: 11px 2px 0;
          color: #817c73;
          font-size: .7rem;
          line-height: 1.5;
        }
        .unifiedRankingCard {
          margin-top: 18px;
          padding: 10px 14px 12px;
          overflow: hidden;
        }
        .rankingTabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-bottom: 1px solid rgba(255,205,80,.09);
        }
        .rankingTabs button {
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 0;
          border-radius: 12px 12px 0 0;
          background: transparent;
          color: #767168;
          font: inherit;
          font-size: .7rem;
          font-weight: 900;
          cursor: pointer;
        }
        .rankingTabs button.active {
          background: linear-gradient(180deg,rgba(244,183,40,.11),rgba(244,183,40,.045));
          color: #ffd45f;
          box-shadow: inset 0 -2px 0 rgba(255,203,66,.72);
        }
        .rankingMeta {
          min-height: 28px;
          padding: 0 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #777269;
          font-size: .58rem;
          font-weight: 850;
        }
        .countryHeader,
        .countryRow {
          width: 100%;
          display: grid;
          grid-template-columns: 50px minmax(0,1fr) 82px;
          column-gap: 10px;
          align-items: center;
          box-sizing: border-box;
        }
        .countryHeader {
          min-height: 34px;
          margin-bottom: 8px;
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
          width: 100%;
          max-height: 200px;
          overflow-y: auto;
          overscroll-behavior: contain;
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
        .countryRow {
          min-height: 50px;
          padding: 0 12px;
          border-bottom: 1px solid rgba(255,255,255,.055);
          color: #e9e5dc;
        }
        .rank {
          text-align: center;
          color: #bdb7ac;
          font-size: .74rem;
          font-variant-numeric: tabular-nums;
        }
        .identity {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .countryCode {
          width: 28px;
          height: 28px;
          flex: 0 0 28px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 9px;
          background: rgba(255,255,255,.035);
          color: #d6d1c7;
          font-size: .58rem;
          font-weight: 900;
          letter-spacing: .02em;
        }
        .countryCopy {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .countryCopy strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: .72rem;
          font-weight: 850;
        }
        .countryCopy small {
          flex: 0 0 auto;
          color: #a48b45;
          font-size: .51rem;
          font-weight: 900;
          white-space: nowrap;
        }
        .total {
          text-align: center;
          color: #ffd35c;
          font-size: .78rem;
          font-variant-numeric: tabular-nums;
        }
        @media (max-width: 430px) {
          .screen {
            padding-right: 14px;
            padding-left: 14px;
          }
          .topBar {
            gap: 9px;
          }
          .topActions {
            gap: 5px;
          }
          .accountChip {
            max-width: 103px;
            overflow: hidden;
            white-space: nowrap;
          }
          .languageSelect {
            max-width: 76px;
          }
          .countryHeader,
          .countryRow {
            grid-template-columns: 42px minmax(0,1fr) 70px;
            column-gap: 8px;
          }
          .countryHeader,
          .countryRow {
            padding-right: 8px;
            padding-left: 8px;
          }
          .countryCopy {
            gap: 4px;
          }
          .countryCopy small {
            font-size: .48rem;
          }
        }
        @media (max-width: 360px) {
          .accountChip {
            display: none;
          }
          .rankingTabs button {
            font-size: .64rem;
          }
          .countryCopy small {
            display: none;
          }
        }
      `}</style>
    </QaWalletLauncherOverrideProvider>
  );
}
