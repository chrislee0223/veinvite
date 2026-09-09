'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { COUNTRY_ARRIVAL_METRIC_COPY } from '@/lib/i18n/countryArrivalMetricCopy';
import { COUNTRY_LEADERBOARD_COPY } from '@/lib/i18n/countryLeaderboardCopy';
import '@/lib/i18n/localePacks/registerExpandedLocales';
import { LEADERBOARD_COPY } from '@/lib/i18n/leaderboardCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';
import {
  getCachedPublicLeaderboard,
  loadPublicLeaderboard,
} from '@/lib/leaderboardClientCache';
import type {
  PublicCountryArrivalResponse,
  PublicLeaderboardEntry,
  PublicLeaderboardResponse,
} from '@/lib/types';
import { CountryFlag } from './CountryFlag';
import { PublicLeaderboard as InviterLeaderboard } from './InviterLeaderboard';

type RankingView = 'inviter' | 'country';
type CountryState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: PublicCountryArrivalResponse | null;
};
type PersonalizationState = {
  walletKey: string | null;
  status: 'idle' | 'pending' | 'resolved' | 'unavailable';
  currentUser: PublicLeaderboardEntry | null;
};
type CountryCache = {
  loadedAt: number;
  data: PublicCountryArrivalResponse;
};

const PUBLIC_RANK_LIMIT = 100;
const COUNTRY_CACHE_TTL_MS = 60_000;
const COUNTRY_VISIBLE_ROWS = 5;
let countryCache: CountryCache | null = null;
let countryInFlight: Promise<PublicCountryArrivalResponse> | null = null;

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

function normalizeWallet(wallet: string | null): string | null {
  const normalized = wallet?.trim().toLowerCase() ?? '';
  return normalized || null;
}

function sameLeaderboardSnapshot(
  publicData: PublicLeaderboardResponse,
  personalizedData: PublicLeaderboardResponse,
): boolean {
  return (
    publicData.network === personalizedData.network &&
    publicData.currentRoundId === personalizedData.currentRoundId &&
    publicData.comparison.roundId === personalizedData.comparison.roundId &&
    publicData.comparison.rankingAlgorithmVersion ===
      personalizedData.comparison.rankingAlgorithmVersion
  );
}

function getFreshCountryCache(): PublicCountryArrivalResponse | null {
  if (!countryCache) return null;
  if (Date.now() - countryCache.loadedAt > COUNTRY_CACHE_TTL_MS) {
    countryCache = null;
    return null;
  }
  return countryCache.data;
}

async function fetchCountryArrivals(): Promise<PublicCountryArrivalResponse> {
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

function loadCountryArrivals(
  force = false,
): Promise<PublicCountryArrivalResponse> {
  if (!force) {
    const cached = getFreshCountryCache();
    if (cached) return Promise.resolve(cached);
    if (countryInFlight) return countryInFlight;
  }

  const request = fetchCountryArrivals()
    .then((data) => {
      countryCache = {
        loadedAt: Date.now(),
        data,
      };
      return data;
    })
    .finally(() => {
      if (countryInFlight === request) {
        countryInFlight = null;
      }
    });

  countryInFlight = request;
  return request;
}

export function PublicLeaderboardHub({
  locale,
  wallet,
}: {
  locale: SupportedLocale;
  wallet: string | null;
}) {
  const initialPublic = getCachedPublicLeaderboard(null);
  const initialCountry = getFreshCountryCache();
  const [rankingView, setRankingView] = useState<RankingView>('inviter');
  const [publicState, setPublicState] = useState<{
    data: PublicLeaderboardResponse | null;
    confirmed: boolean;
    failed: boolean;
  }>(() => ({
    data: initialPublic,
    // Even a session seed is treated as display-only until loadPublicLeaderboard
    // confirms the current 30-second snapshot. This prevents stale seeds from
    // briefly fabricating an old personal rank after a hard refresh.
    confirmed: false,
    failed: false,
  }));
  const [personalization, setPersonalization] =
    useState<PersonalizationState>(() => ({
      walletKey: normalizeWallet(wallet),
      status: wallet ? 'pending' : 'idle',
      currentUser: null,
    }));
  const [countryState, setCountryState] = useState<CountryState>(() => ({
    status: initialCountry ? 'ready' : 'idle',
    data: initialCountry,
  }));

  useEffect(() => {
    let active = true;
    const cached = getCachedPublicLeaderboard(null);
    if (cached) {
      setPublicState((current) => ({
        data: cached,
        confirmed: current.confirmed && current.data === cached,
        failed: false,
      }));
    }

    void loadPublicLeaderboard(null)
      .then((data) => {
        if (!active) return;
        setPublicState({ data, confirmed: true, failed: false });
      })
      .catch(() => {
        if (!active) return;
        setPublicState((current) => ({
          ...current,
          confirmed: false,
          failed: true,
        }));
      });

    return () => {
      active = false;
    };
  }, []);

  const publicData = publicState.data;
  const walletKey = normalizeWallet(wallet);

  useEffect(() => {
    let active = true;

    if (!walletKey) {
      setPersonalization({
        walletKey: null,
        status: 'idle',
        currentUser: null,
      });
      return () => {
        active = false;
      };
    }

    if (!publicData || !publicState.confirmed) {
      setPersonalization({
        walletKey,
        status: 'pending',
        currentUser: null,
      });
      return () => {
        active = false;
      };
    }

    const publicMatch = publicData.leaders.find(
      (entry) => entry.walletAddress.toLowerCase() === walletKey,
    );
    if (publicMatch) {
      setPersonalization({
        walletKey,
        status: 'resolved',
        currentUser: {
          ...publicMatch,
          isCurrentWallet: true,
        },
      });
      return () => {
        active = false;
      };
    }

    // If fewer than 100 ranked wallets exist, absence from the public list is
    // definitive. Avoid a private current-wallet request entirely.
    if (publicData.leaders.length < PUBLIC_RANK_LIMIT) {
      setPersonalization({
        walletKey,
        status: 'resolved',
        currentUser: null,
      });
      return () => {
        active = false;
      };
    }

    setPersonalization({
      walletKey,
      status: 'pending',
      currentUser: null,
    });

    const refreshPublicSnapshot = () => {
      void loadPublicLeaderboard(null, { force: true })
        .then((fresh) => {
          if (!active) return;
          setPublicState({ data: fresh, confirmed: true, failed: false });
        })
        .catch(() => {
          if (!active) return;
          setPersonalization({
            walletKey,
            status: 'unavailable',
            currentUser: null,
          });
        });
    };

    void loadPublicLeaderboard(walletKey)
      .then((personalizedData) => {
        if (!active) return;

        if (!sameLeaderboardSnapshot(publicData, personalizedData)) {
          setPersonalization({
            walletKey,
            status: 'pending',
            currentUser: null,
          });
          refreshPublicSnapshot();
          return;
        }

        const currentUser = personalizedData.currentUser;
        if (currentUser && currentUser.rank <= PUBLIC_RANK_LIMIT) {
          // A wallet entering the top 100 between the public and personalized
          // reads means the public list is stale. Refresh the public snapshot
          // rather than splicing an incompatible row into an older ranking.
          setPersonalization({
            walletKey,
            status: 'pending',
            currentUser: null,
          });
          refreshPublicSnapshot();
          return;
        }

        setPersonalization({
          walletKey,
          status: 'resolved',
          currentUser: currentUser
            ? { ...currentUser, isCurrentWallet: true }
            : null,
        });
      })
      .catch(() => {
        if (!active) return;
        setPersonalization({
          walletKey,
          status: 'unavailable',
          currentUser: null,
        });
      });

    return () => {
      active = false;
    };
  }, [publicData, publicState.confirmed, walletKey]);

  useEffect(() => {
    setRankingView('inviter');
  }, [walletKey]);

  const refreshCountry = useCallback((force = false) => {
    const cachedCountry = force ? null : getFreshCountryCache();
    if (cachedCountry) {
      setCountryState({ status: 'ready', data: cachedCountry });
      return;
    }

    setCountryState((current) => ({
      status: 'loading',
      data: current.data,
    }));

    void loadCountryArrivals(force)
      .then((data) => {
        setCountryState({ status: 'ready', data });
      })
      .catch(() => {
        setCountryState((current) => ({
          status: 'error',
          data: current.data,
        }));
      });
  }, []);

  useEffect(() => {
    refreshCountry(false);
  }, [refreshCountry]);

  const openCountry = useCallback(() => {
    setRankingView('country');
    refreshCountry(false);
  }, [refreshCountry]);

  const retryCountry = useCallback(() => {
    refreshCountry(true);
  }, [refreshCountry]);

  const displayData = useMemo<PublicLeaderboardResponse | null>(() => {
    if (!publicData) return null;

    const resolvedCurrentUser =
      personalization.walletKey === walletKey &&
      personalization.status === 'resolved'
        ? personalization.currentUser
        : null;
    const currentAddress = resolvedCurrentUser?.walletAddress.toLowerCase() ?? null;
    const leaders = publicData.leaders.map((entry) => {
      const isCurrentWallet = Boolean(
        currentAddress && entry.walletAddress.toLowerCase() === currentAddress,
      );
      return entry.isCurrentWallet === isCurrentWallet
        ? entry
        : { ...entry, isCurrentWallet };
    });

    return {
      ...publicData,
      leaders,
      currentUser: resolvedCurrentUser,
    };
  }, [personalization, publicData, walletKey]);

  const personalizationPending = Boolean(
    walletKey &&
    (
      personalization.walletKey !== walletKey ||
      personalization.status === 'pending' ||
      personalization.status === 'unavailable'
    ),
  );
  const displayWallet = personalizationPending ? null : wallet;
  const countryCopy = COUNTRY_LEADERBOARD_COPY[locale];
  const countryMetricCopy = COUNTRY_ARRIVAL_METRIC_COPY[locale];
  const leaderboardCopy = LEADERBOARD_COPY[locale] ?? LEADERBOARD_COPY.en;
  const countryData = countryState.data;
  const countryLeaders = useMemo(
    () => countryData?.leaders ?? [],
    [countryData],
  );

  if (!displayData) {
    return <InviterLeaderboard locale={locale} wallet={wallet} />;
  }

  const showCountryData = Boolean(countryData);
  const showCountryError = countryState.status === 'error' && !countryData;
  const visibleRankingView: RankingView =
    rankingView === 'country' && (showCountryData || showCountryError)
      ? 'country'
      : 'inviter';

  return (
    <section
      className={`leaderboardHub${
        personalizationPending ? ' personalizationPending' : ''
      }`}
      data-public-leaderboard-stale={
        publicState.failed && publicData ? 'true' : undefined
      }
    >
      <div className="impactOnly">
        <InviterLeaderboard
          locale={locale}
          wallet={displayWallet}
          previewData={displayData}
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
            <span>{countryCopy.inviterTab}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rankingView === 'country'}
            className={rankingView === 'country' ? 'active' : ''}
            onClick={openCountry}
          >
            <span>{countryCopy.countryTab}</span>
          </button>
        </div>

        {visibleRankingView === 'inviter' ? (
          <div className="inviterInside">
            <InviterLeaderboard
              locale={locale}
              wallet={displayWallet}
              previewData={displayData}
            />
          </div>
        ) : (
          <div className="countryPanel">
            <div className="countryHeader" aria-hidden="true">
              <span className="countryHeaderRank">{leaderboardCopy.rank}</span>
              <span className="countryHeaderCountry">{countryCopy.country}</span>
              <span title={countryMetricCopy.newUsers}>
                {countryMetricCopy.newUsers}
              </span>
              <span title={countryMetricCopy.returningUsers}>
                {countryMetricCopy.returningUsers}
              </span>
              <span title={countryMetricCopy.totalUsers}>
                {countryMetricCopy.totalUsers}
              </span>
            </div>

            {showCountryData && countryLeaders.length > 0 ? (
              <div className="countryScroll" aria-label={countryCopy.countryTab}>
                {countryLeaders.map((row) => (
                  <div
                    className="countryRow"
                    data-rank={row.rank <= 3 ? row.rank : undefined}
                    key={row.countryCode}
                  >
                    <strong className="countryRank">{row.rank}</strong>
                    <div className="countryIdentity">
                      <CountryFlag countryCode={row.countryCode} />
                      <div className="countryNameLine">
                        <strong>{countryName(row.countryCode, locale)}</strong>
                      </div>
                    </div>
                    <strong className="countryMetricValue countryNew">
                      {row.newUsers.toLocaleString(locale)}
                    </strong>
                    <strong className="countryMetricValue countryReturning">
                      {row.returningUsers.toLocaleString(locale)}
                    </strong>
                    <strong className="countryMetricValue countryTotal">
                      {row.completedReferrals.toLocaleString(locale)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : showCountryData ? (
              <div className="countryState" role="status">
                {countryCopy.empty}
              </div>
            ) : showCountryError ? (
              <div className="countryState countryError" role="status">
                <span>{countryCopy.unavailable}</span>
                <button type="button" onClick={retryCountry}>
                  {leaderboardCopy.retry}
                </button>
              </div>
            ) : (
              <div className="countrySkeleton" aria-hidden="true">
                {Array.from({ length: COUNTRY_VISIBLE_ROWS }, (_, index) => (
                  <div className="countryPlaceholderRow" key={index}>
                    <strong>—</strong>
                    <span>—</span>
                    <strong>—</strong>
                    <strong>—</strong>
                    <strong>—</strong>
                  </div>
                ))}
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
        .inviterInside .leaderboardInlineError {
          display:none !important;
        }
        .inviterInside .tableHeader {
          margin-bottom:6px !important;
          border-bottom:0 !important;
        }
        .inviterInside .rankRow {
          border-bottom:0 !important;
        }
        .inviterInside .rankDivider {
          min-height:22px !important;
          padding:1px 0 0 !important;
          font-size:1rem !important;
        }
        .inviterInside .rankContextNote {
          margin-top:8px !important;
        }
        .leaderboardHub.personalizationPending .rankContextNote {
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
          padding:8px 14px 12px;
          overflow:hidden;
          border:1px solid rgba(255,205,80,.14);
          border-radius:21px;
          background:rgba(255,255,255,.035);
        }
        .rankingTabs {
          display:grid;
          grid-template-columns:1fr 1fr;
          margin:0 0 8px;
          border-bottom:0;
        }
        .rankingTabs button {
          position:relative;
          min-width:0;
          min-height:48px;
          padding:0 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          border:0;
          border-radius:0;
          background:transparent;
          color:#777269;
          font:inherit;
          font-size:.72rem;
          font-weight:900;
          letter-spacing:-.01em;
          cursor:pointer;
          transition:color 120ms ease-out;
        }
        .rankingTabs button > span {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .rankingTabs button::after {
          content:'';
          position:absolute;
          left:50%;
          bottom:-1px;
          width:72%;
          height:2px;
          border-radius:999px;
          background:transparent;
          transform:translateX(-50%);
          transition:background 120ms ease-out,box-shadow 120ms ease-out;
        }
        .rankingTabs button.active {
          background:transparent;
          color:#ffd45f;
          box-shadow:none;
        }
        .rankingTabs button.active::after {
          background:#f4b728;
          box-shadow:0 0 9px rgba(244,183,40,.16);
        }
        .rankingTabs button:hover:not(.active) {
          color:#aaa49a;
        }
        .rankingTabs button:focus-visible,
        .countryError button:focus-visible {
          outline:1px solid rgba(255,205,80,.55);
          outline-offset:-3px;
        }
        @media (max-width:430px) {
          .rankingTabs button {
            min-height:44px;
            padding:0 6px;
            font-size:.67rem;
          }
          .rankingTabs button::after {
            width:76%;
          }
        }
        @media (max-width:360px) {
          .rankingTabs button {
            font-size:.63rem;
          }
        }
        @media (prefers-reduced-motion:reduce) {
          .rankingTabs button,
          .rankingTabs button::after {
            transition:none;
          }
        }
      `}</style>
    </section>
  );
}
