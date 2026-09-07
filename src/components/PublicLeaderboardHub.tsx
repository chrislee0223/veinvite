'use client';

import { useEffect, useMemo, useState } from 'react';

import { COUNTRY_LEADERBOARD_COPY } from '@/lib/i18n/countryLeaderboardCopy';
import '@/lib/i18n/localePacks/registerExpandedLocales';
import { LEADERBOARD_COPY } from '@/lib/i18n/leaderboardCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';
import {
  getCachedPublicLeaderboard,
  getPublicLeaderboardCacheKey,
  loadPublicLeaderboard,
} from '@/lib/leaderboardClientCache';
import type {
  PublicCountryArrivalResponse,
  PublicLeaderboardResponse,
} from '@/lib/types';
import { PublicLeaderboard as InviterLeaderboard } from './InviterLeaderboard';

type RankingView = 'inviter' | 'country';
type CountryState =
  | { status: 'idle'; data: null }
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: PublicCountryArrivalResponse }
  | { status: 'error'; data: null };

function countryName(code: string, locale: SupportedLocale): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
    } catch {
      return code;
    }
  }
}

async function loadCountryArrivals(): Promise<PublicCountryArrivalResponse> {
  const response = await fetch('/api/leaderboard/country', {
    cache: 'no-store',
  });
  const result = (await response.json()) as
    | PublicCountryArrivalResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      'error' in result && result.error
        ? result.error
        : 'Country arrivals are temporarily unavailable.',
    );
  }

  return result as PublicCountryArrivalResponse;
}

export function PublicLeaderboardHub({
  locale,
  wallet,
}: {
  locale: SupportedLocale;
  wallet: string | null;
}) {
  const cacheKey = getPublicLeaderboardCacheKey(wallet);
  const cached = getCachedPublicLeaderboard(wallet);
  const [rankingView, setRankingView] = useState<RankingView>('inviter');
  const [leaderboardState, setLeaderboardState] = useState<{
    cacheKey: string;
    data: PublicLeaderboardResponse | null;
    failed: boolean;
  }>(() => ({
    cacheKey,
    data: cached,
    failed: false,
  }));
  const [countryState, setCountryState] = useState<CountryState>({
    status: 'idle',
    data: null,
  });
  const [countryRequestVersion, setCountryRequestVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const currentCached = getCachedPublicLeaderboard(wallet);
    setLeaderboardState({
      cacheKey,
      data: currentCached,
      failed: false,
    });
    setRankingView('inviter');

    void loadPublicLeaderboard(wallet)
      .then((data) => {
        if (!active) return;
        setLeaderboardState({ cacheKey, data, failed: false });
      })
      .catch(() => {
        if (!active) return;
        setLeaderboardState((current) => ({
          cacheKey,
          data: current.cacheKey === cacheKey ? current.data : null,
          failed: true,
        }));
      });

    return () => {
      active = false;
    };
  }, [cacheKey, wallet]);

  useEffect(() => {
    if (rankingView !== 'country') return;

    let active = true;
    setCountryState({ status: 'loading', data: null });
    void loadCountryArrivals()
      .then((data) => {
        if (!active) return;
        setCountryState({ status: 'ready', data });
      })
      .catch(() => {
        if (!active) return;
        setCountryState({ status: 'error', data: null });
      });

    return () => {
      active = false;
    };
  }, [rankingView, countryRequestVersion]);

  const data = leaderboardState.cacheKey === cacheKey
    ? leaderboardState.data
    : cached;
  const countryCopy = COUNTRY_LEADERBOARD_COPY[locale];
  const leaderboardCopy = LEADERBOARD_COPY[locale] ?? LEADERBOARD_COPY.en;
  const countryData = countryState.status === 'ready'
    ? countryState.data
    : null;
  const countryLeaders = useMemo(
    () => countryData?.leaders ?? [],
    [countryData],
  );
  const knownCompleted = countryData?.knownCompleted ?? 0;
  const unknownCompleted = countryData?.unknownCompleted ?? 0;
  const totalCountryEligible = knownCompleted + unknownCompleted;

  if (!data || leaderboardState.failed) {
    return <InviterLeaderboard locale={locale} wallet={wallet} />;
  }

  return (
    <section className="leaderboardHub">
      <div className="impactOnly">
        <InviterLeaderboard
          locale={locale}
          wallet={wallet}
          previewData={data}
        />
      </div>

      <section className="unifiedRankingCard">
        <div
          className="rankingTabs"
          role="tablist"
          aria-label={countryCopy.tabAria}
        >
          <button
            type="button"
            role="tab"
            aria-selected={rankingView === 'inviter'}
            className={rankingView === 'inviter' ? 'active' : ''}
            onClick={() => setRankingView('inviter')}
          >
            <span aria-hidden="true">♙</span>
            <span>{countryCopy.inviterTab}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rankingView === 'country'}
            className={rankingView === 'country' ? 'active' : ''}
            onClick={() => setRankingView('country')}
          >
            <span aria-hidden="true">◎</span>
            <span>{countryCopy.countryTab}</span>
          </button>
        </div>

        <div className="rankingMeta" aria-live="polite">
          {rankingView === 'inviter' ? (
            <>
              <span>TOP 100</span>
              <span aria-hidden="true">&nbsp;</span>
            </>
          ) : countryState.status === 'ready' ? (
            <>
              <span>
                {countryCopy.known} {knownCompleted.toLocaleString()} /{' '}
                {totalCountryEligible.toLocaleString()}
              </span>
              <span>
                {countryCopy.unknown} {unknownCompleted.toLocaleString()}
              </span>
            </>
          ) : countryState.status === 'loading' ? (
            <span>{leaderboardCopy.loading}</span>
          ) : (
            <span aria-hidden="true">&nbsp;</span>
          )}
        </div>

        {rankingView === 'inviter' ? (
          <div className="inviterInside">
            <InviterLeaderboard
              locale={locale}
              wallet={wallet}
              previewData={data}
            />
          </div>
        ) : (
          <div className="countryPanel">
            <div className="countryHeader" aria-hidden="true">
              <span>{leaderboardCopy.rank}</span>
              <span>{countryCopy.countryTab}</span>
              <span>{countryCopy.completed}</span>
            </div>

            {countryState.status === 'loading' || countryState.status === 'idle' ? (
              <div className="countryState" role="status">
                {leaderboardCopy.loading}
              </div>
            ) : countryState.status === 'error' ? (
              <div className="countryState countryError" role="status">
                <span>{countryCopy.unavailable}</span>
                <button
                  type="button"
                  onClick={() =>
                    setCountryRequestVersion((current) => current + 1)
                  }
                >
                  {leaderboardCopy.retry}
                </button>
              </div>
            ) : countryLeaders.length > 0 ? (
              <div className="countryScroll" aria-label={countryCopy.countryTab}>
                {countryLeaders.map((row) => (
                  <div className="countryRow" key={row.countryCode}>
                    <strong className="countryRank">{row.rank}</strong>
                    <div className="countryIdentity">
                      <span className="countryCode" aria-hidden="true">
                        {row.countryCode}
                      </span>
                      <div className="countryText">
                        <div className="countryNameLine">
                          <strong>{countryName(row.countryCode, locale)}</strong>
                          {row.currentRoundCompleted > 0 ? (
                            <small className="roundGain">
                              +{row.currentRoundCompleted.toLocaleString()} {countryCopy.thisRound}
                            </small>
                          ) : null}
                        </div>
                        <small className="countryMix">
                          <span>
                            {leaderboardCopy.newUsers} {row.newUsers.toLocaleString()}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {leaderboardCopy.returningUsers}{' '}
                            {row.returningUsers.toLocaleString()}
                          </span>
                        </small>
                      </div>
                    </div>
                    <strong className="countryTotal">
                      {row.completedReferrals.toLocaleString()}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="countryState" role="status">
                {countryCopy.empty}
              </div>
            )}
          </div>
        )}
      </section>

      <style jsx global>{`
        .impactOnly .leaderboardPage > .rankingCard,
        .impactOnly .leaderboardPage > .leaderboardInlineError {
          display:none !important;
        }
        .impactOnly .leaderboardPage {
          width:100% !important;
          padding-bottom:0 !important;
        }
        .inviterInside .leaderboardPage > .impactCard {
          display:none !important;
        }
        .inviterInside .leaderboardPage {
          width:100% !important;
          padding-bottom:0 !important;
        }
        .inviterInside .leaderboardPage > .rankingCard {
          margin-top:0 !important;
          padding:0 !important;
          border:0 !important;
          border-radius:0 !important;
          background:transparent !important;
        }
        .inviterInside .rankScroll {
          max-height:250px !important;
        }
        .inviterInside .leaderboardInlineError {
          display:none !important;
        }
      `}</style>

      <style jsx>{`
        .leaderboardHub {
          width:min(100%,520px);
          margin:0 auto;
          padding-bottom:12px;
        }
        .unifiedRankingCard {
          margin-top:18px;
          padding:10px 14px 12px;
          overflow:hidden;
          border:1px solid rgba(255,205,80,.14);
          border-radius:21px;
          background:rgba(255,255,255,.035);
        }
        .rankingTabs {
          display:grid;
          grid-template-columns:1fr 1fr;
          border-bottom:1px solid rgba(255,205,80,.09);
        }
        .rankingTabs button {
          min-width:0;
          min-height:42px;
          padding:0 8px;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:7px;
          border:0;
          border-radius:12px 12px 0 0;
          background:transparent;
          color:#767168;
          font:inherit;
          font-size:.7rem;
          font-weight:900;
          cursor:pointer;
        }
        .rankingTabs button > span:last-child {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .rankingTabs button.active {
          background:linear-gradient(180deg,rgba(244,183,40,.11),rgba(244,183,40,.045));
          color:#ffd45f;
          box-shadow:inset 0 -2px 0 rgba(255,203,66,.72);
        }
        .rankingTabs button:focus-visible,
        .countryError button:focus-visible {
          outline:1px solid rgba(255,205,80,.55);
          outline-offset:2px;
        }
        .rankingMeta {
          min-height:28px;
          padding:0 10px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          color:#777269;
          font-size:.58rem;
          font-weight:850;
          font-variant-numeric:tabular-nums;
        }
        .rankingMeta span {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .countryHeader,
        .countryRow {
          width:100%;
          display:grid;
          grid-template-columns:48px minmax(0,1fr) 72px;
          column-gap:10px;
          align-items:center;
          box-sizing:border-box;
        }
        .countryHeader {
          min-height:34px;
          margin-bottom:8px;
          padding:0 10px 9px;
          border-bottom:1px solid rgba(255,205,80,.09);
          color:#777269;
          font-size:.61rem;
          font-weight:900;
        }
        .countryHeader span {
          min-width:0;
          text-align:center;
        }
        .countryScroll,
        .countryState {
          min-height:250px;
          max-height:250px;
        }
        .countryScroll {
          width:100%;
          overflow-y:auto;
          overscroll-behavior:contain;
          scrollbar-gutter:stable;
          scrollbar-width:thin;
          scrollbar-color:rgba(244,183,40,.45) transparent;
        }
        .countryScroll::-webkit-scrollbar {
          width:5px;
        }
        .countryScroll::-webkit-scrollbar-thumb {
          border-radius:999px;
          background:rgba(244,183,40,.45);
        }
        .countryRow {
          min-height:58px;
          padding:5px 10px;
          border-bottom:1px solid rgba(255,255,255,.055);
          color:#e9e5dc;
        }
        .countryRank {
          text-align:center;
          color:#bdb7ac;
          font-size:.74rem;
          font-variant-numeric:tabular-nums;
        }
        .countryIdentity {
          min-width:0;
          display:flex;
          align-items:center;
          gap:8px;
        }
        .countryCode {
          width:28px;
          height:28px;
          flex:0 0 28px;
          display:grid;
          place-items:center;
          border:1px solid rgba(255,255,255,.09);
          border-radius:9px;
          background:rgba(255,255,255,.035);
          color:#d6d1c7;
          font-size:.58rem;
          font-weight:900;
          letter-spacing:.02em;
        }
        .countryText {
          min-width:0;
          display:grid;
          gap:3px;
        }
        .countryNameLine {
          min-width:0;
          display:flex;
          align-items:center;
          gap:6px;
        }
        .countryNameLine strong {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          font-size:.72rem;
          font-weight:850;
        }
        .roundGain {
          flex:0 0 auto;
          color:#a48b45;
          font-size:.49rem;
          font-weight:900;
          white-space:nowrap;
        }
        .countryMix {
          min-width:0;
          display:flex;
          align-items:center;
          gap:5px;
          color:#777269;
          font-size:.49rem;
          font-weight:800;
          line-height:1.3;
        }
        .countryMix span:not([aria-hidden]) {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .countryTotal {
          text-align:center;
          color:#ffd35c;
          font-size:.8rem;
          font-variant-numeric:tabular-nums;
        }
        .countryState {
          padding:24px;
          display:grid;
          place-items:center;
          align-content:center;
          gap:12px;
          box-sizing:border-box;
          color:#817c73;
          font-size:.72rem;
          font-weight:800;
          line-height:1.6;
          text-align:center;
        }
        .countryError button {
          min-height:36px;
          padding:0 13px;
          border:1px solid rgba(255,205,80,.2);
          border-radius:11px;
          background:rgba(244,183,40,.08);
          color:#d9ba55;
          font:inherit;
          font-size:.65rem;
          font-weight:900;
          cursor:pointer;
        }
        @media (max-width:430px) {
          .countryHeader,
          .countryRow {
            grid-template-columns:40px minmax(0,1fr) 62px;
            column-gap:7px;
          }
          .countryHeader,
          .countryRow {
            padding-right:7px;
            padding-left:7px;
          }
          .countryIdentity {
            gap:6px;
          }
          .countryNameLine {
            gap:4px;
          }
          .roundGain,
          .countryMix {
            font-size:.46rem;
          }
        }
        @media (max-width:360px) {
          .rankingTabs button {
            font-size:.64rem;
          }
          .roundGain {
            display:none;
          }
          .countryMix {
            gap:3px;
            font-size:.43rem;
          }
        }
      `}</style>
    </section>
  );
}
