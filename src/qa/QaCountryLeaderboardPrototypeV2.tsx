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
type CountryRow = { countryCode: string; total: number; roundGain: number };

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
    coverage: '국가 확인 가능',
    unknown: '국가 미확인',
    thisRound: '이번 라운드',
    basis: '미션 전체 완료 및 검증 통과 기준',
    qaBadge: 'QA 미리보기',
  },
  en: {
    inviter: 'Inviter ranking',
    country: 'Country arrivals',
    completeUsers: 'Completed',
    coverage: 'Country identified',
    unknown: 'Country unknown',
    thisRound: 'this round',
    basis: 'Counts fully completed and verified referrals',
    qaBadge: 'QA preview',
  },
} as const;

function copyFor(locale: SupportedLocale) {
  return locale === 'ko' ? COPY.ko : COPY.en;
}

function countryFlag(code: string) {
  return code.toUpperCase().replace(/./g, (char) =>
    String.fromCodePoint(127397 + char.charCodeAt(0)),
  );
}

function countryName(code: string, locale: SupportedLocale) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function rewardEntry(rank: number, walletAddress: string, referrals: number, reward: number, current = false): PublicLeaderboardEntry {
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
      rankingAlgorithmVersion: 'qa-country-preview-v2',
    },
    impact: { totalActivatedUsers: 21, newUsers: 14, returningUsers: 7 },
    leaders,
    currentUser: leaders[1],
  };
}

export function QaCountryLeaderboardPrototypeV2() {
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
            <select className="languageSelect" value={locale} onChange={(event) => setLocale(event.target.value as SupportedLocale)} aria-label={homeCopy.languageAria}>
              {LANGUAGE_OPTIONS.map((option) => <option key={option.locale} value={option.locale}>{option.nativeName}</option>)}
            </select>
            <button type="button" className="accountChip"><span />0x0000···0a11</button>
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

          <div className="rankingSwitch" role="tablist" aria-label="Ranking view">
            <button type="button" role="tab" aria-selected={rankingView === 'inviter'} className={rankingView === 'inviter' ? 'active' : ''} onClick={() => setRankingView('inviter')}>
              <span aria-hidden="true">♙</span>{copy.inviter}
            </button>
            <button type="button" role="tab" aria-selected={rankingView === 'country'} className={rankingView === 'country' ? 'active' : ''} onClick={() => setRankingView('country')}>
              <span aria-hidden="true">◎</span>{copy.country}
            </button>
          </div>

          {rankingView === 'inviter' ? (
            <div className="existingLeaderboard">
              <PublicLeaderboard locale={locale} wallet={QA_WALLET} previewData={inviterData} />
            </div>
          ) : (
            <section className="countryCard">
              <div className="coverageLine"><span>{copy.coverage}</span><strong>{knownCount} / {totalCount}</strong></div>
              <div className="countryHeader" aria-hidden="true">
                <span>{leaderboardCopy.rank}</span><span>{copy.country}</span><span>{copy.completeUsers}</span>
              </div>
              <div className="countryScroll">
                {COUNTRY_ROWS.map((row, index) => (
                  <div className="countryRow" key={row.countryCode}>
                    <strong className="rank">{index + 1}</strong>
                    <div className="identity">
                      <span className="flag" aria-hidden="true">{countryFlag(row.countryCode)}</span>
                      <div className="countryCopy">
                        <strong>{countryName(row.countryCode, locale)}</strong>
                        {row.roundGain > 0 ? <small>+{row.roundGain} {copy.thisRound}</small> : null}
                      </div>
                    </div>
                    <strong className="total">{row.total}</strong>
                  </div>
                ))}
              </div>
              <div className="unknownRow"><span className="unknownIcon">?</span><span>{copy.unknown}</span><strong>{unknownCount}</strong></div>
              <p className="basis">{copy.basis}</p>
            </section>
          )}
        </section>

        <AppBottomNavigation activeTab="leaderboard" locale={locale} onChange={() => {}} />
      </main>

      <style jsx global>{`
        .existingLeaderboard .leaderboardPage > .impactCard { display: none !important; }
        .existingLeaderboard .leaderboardPage > .rankingCard { margin-top: 0 !important; }
      `}</style>
      <style jsx>{`
        .screen { min-height: 100svh; box-sizing: border-box; padding: 22px 18px 118px; color: #fff; background: radial-gradient(circle at 50% 16%, rgba(244,183,40,.14), transparent 32%), #080807; }
        .topBar, .content { width: min(100%,520px); margin: 0 auto; }
        .topBar { margin-bottom: 26px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
        .topActions { min-width: 0; display: flex; align-items: center; gap: 7px; }
        .bell, .languageSelect, .accountChip { min-height: 38px; border: 1px solid rgba(255,205,80,.14); border-radius: 13px; background: rgba(255,255,255,.035); color: #d7d1c4; }
        .bell { width: 38px; display: grid; place-items: center; }
        .languageSelect { max-width: 88px; padding: 0 25px 0 9px; font: inherit; font-size: .65rem; font-weight: 800; }
        .languageSelect option { color: #111; }
        .accountChip { padding: 0 10px; display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: .63rem; font-weight: 850; }
        .accountChip span { width: 7px; height: 7px; border-radius: 999px; background: #7adf8d; }
        .impactCard, .countryCard { border: 1px solid rgba(255,205,80,.14); border-radius: 21px; background: rgba(255,255,255,.035); }
        .impactCard { position: relative; padding: 18px; }
        .qaLabel { position: absolute; top: 15px; right: 16px; color: #6f6a61; font-size: .56rem; font-weight: 850; }
        h2 { margin: 0; font-size: 1rem; }
        .impactSummaryButton { width: 100%; min-height: 104px; margin-top: 14px; padding: 16px 18px; display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto 1fr; align-items: center; gap: 4px 12px; border: 1px solid rgba(255,205,80,.16); border-radius: 17px; background: linear-gradient(135deg,rgba(244,183,40,.11),rgba(255,255,255,.025)); color: #f8f4e8; text-align: left; }
        .impactSummaryButton span { color: #928c80; font-size: .7rem; font-weight: 850; }
        .impactSummaryButton strong { grid-row: 2; color: #ffd35c; font-size: 2rem; line-height: 1; }
        .impactSummaryButton b { grid-column: 2; grid-row: 1 / span 2; color: #d9b956; font-size: 1.55rem; font-weight: 500; }
        .impactCard > p { margin: 11px 2px 0; color: #817c73; font-size: .7rem; line-height: 1.5; }
        .rankingSwitch { margin-top: 14px; padding: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; border: 1px solid rgba(255,205,80,.13); border-radius: 17px; background: rgba(255,255,255,.028); }
        .rankingSwitch button { min-height: 46px; display: flex; align-items: center; justify-content: center; gap: 7px; border: 0; border-radius: 13px; background: transparent; color: #7d786f; font: inherit; font-size: .72rem; font-weight: 900; }
        .rankingSwitch button.active { background: rgba(255,201,61,.1); color: #ffd45f; box-shadow: inset 0 0 0 1px rgba(255,205,80,.12); }
        .existingLeaderboard, .countryCard { margin-top: 14px; }
        .countryCard { padding: 14px 14px 12px; }
        .coverageLine { min-height: 43px; padding: 0 11px; display: flex; align-items: center; justify-content: space-between; color: #777269; font-size: .62rem; font-weight: 850; }
        .coverageLine strong { color: #a49e93; }
        .countryHeader, .countryRow { display: grid; grid-template-columns: 50px minmax(0,1fr) 78px; column-gap: 10px; align-items: center; }
        .countryHeader { min-height: 34px; padding: 0 12px 9px; border-bottom: 1px solid rgba(255,205,80,.09); color: #777269; font-size: .61rem; font-weight: 900; }
        .countryHeader span { text-align: center; }
        .countryScroll { max-height: calc(62px * 5); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: rgba(244,183,40,.45) transparent; }
        .countryRow { min-height: 62px; padding: 0 12px; border-bottom: 1px solid rgba(255,255,255,.055); color: #e9e5dc; }
        .rank { text-align: center; color: #bdb7ac; font-size: .78rem; }
        .identity { min-width: 0; display: flex; align-items: center; gap: 10px; }
        .flag { width: 31px; height: 31px; flex: 0 0 31px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.07); border-radius: 10px; background: rgba(255,255,255,.035); font-size: 1.02rem; }
        .countryCopy { min-width: 0; display: grid; gap: 3px; }
        .countryCopy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .76rem; font-weight: 850; }
        .countryCopy small { color: #9f8950; font-size: .56rem; font-weight: 850; white-space: nowrap; }
        .total { text-align: center; color: #ffd35c; font-size: .88rem; }
        .unknownRow { min-height: 48px; margin-top: 6px; padding: 0 12px; display: grid; grid-template-columns: 31px 1fr auto; align-items: center; gap: 10px; border-radius: 12px; background: rgba(255,255,255,.025); color: #777269; font-size: .66rem; font-weight: 850; }
        .unknownIcon { width: 27px; height: 27px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.07); border-radius: 9px; color: #8e887e; }
        .unknownRow strong { color: #999388; font-size: .76rem; }
        .basis { margin: 10px 2px 2px; color: #68645d; font-size: .6rem; line-height: 1.5; text-align: center; }
        @media (max-width: 430px) { .screen { padding-right: 14px; padding-left: 14px; } .topBar { gap: 9px; } .topActions { gap: 5px; } .accountChip { max-width: 104px; overflow: hidden; white-space: nowrap; } .languageSelect { max-width: 76px; } .countryHeader, .countryRow { grid-template-columns: 42px minmax(0,1fr) 68px; column-gap: 8px; padding-right: 8px; padding-left: 8px; } }
        @media (max-width: 360px) { .accountChip { display: none; } .rankingSwitch button { font-size: .65rem; } }
      `}</style>
    </QaWalletLauncherOverrideProvider>
  );
}
