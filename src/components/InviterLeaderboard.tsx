'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useGetAvatarOfAddress } from '@vechain/vechain-kit';

import { LEADERBOARD_COPY } from '@/lib/i18n/leaderboardCopy';
import { getLeaderboardMovementCopy } from '@/lib/i18n/leaderboardMovementCopy';
import type { Locale } from '@/lib/i18n/locales';
import {
  getCachedPublicLeaderboard,
  getPublicLeaderboardCacheKey,
  loadPublicLeaderboard,
} from '@/lib/leaderboardClientCache';
import type {
  PublicLeaderboardEntry,
  PublicLeaderboardResponse,
} from '@/lib/types';
import { getVeChainExplorerAddressUrl } from '@/lib/vechainExplorer';
import {
  SOFT_FOCUS_MOTION_CSS,
  softFocusCloseDelay,
} from './SoftFocusMotion';

const PUBLIC_RANK_LIMIT = 100;
const WALLET_PREFIX_LENGTH = 5;
const WALLET_SUFFIX_LENGTH = 3;
const RANK_SLOTS = Array.from(
  { length: PUBLIC_RANK_LIMIT },
  (_, index) => index + 1,
);

function maskWallet(address: string): string {
  return `${address.slice(0, WALLET_PREFIX_LENGTH)}…${address.slice(-WALLET_SUFFIX_LENGTH)}`;
}

function formatRewardWei(value: string): string {
  if (!/^\d+$/.test(value)) return '0.00';

  const wei = BigInt(value);
  const scale = 10n ** 18n;
  const hundredths = (wei * 100n + scale / 2n) / scale;
  const whole = (hundredths / 100n).toString();
  const fraction = (hundredths % 100n).toString().padStart(2, '0');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${groupedWhole}.${fraction}`;
}

function rankLabel(rank: number): string {
  return rank <= 0 ? '—' : String(rank);
}

function WalletAvatar({ address }: { address: string }) {
  const avatarHostRef = useRef<HTMLSpanElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const { data: avatarUrl } = useGetAvatarOfAddress(
    shouldLoad ? address : undefined,
  );

  useEffect(() => {
    const node = avatarHostRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <span ref={avatarHostRef} className="walletAvatar" aria-hidden="true">
      {avatarUrl && !imageFailed ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'cover',
            borderRadius: 'inherit',
          }}
        />
      ) : null}
    </span>
  );
}

export function PublicLeaderboard({
  locale,
  wallet,
  previewData,
}: {
  locale: Locale;
  wallet: string | null;
  previewData?: PublicLeaderboardResponse;
}) {
  const cacheKey = getPublicLeaderboardCacheKey(wallet);
  const cachedData = previewData ?? getCachedPublicLeaderboard(wallet);
  const [dataState, setDataState] = useState<{
    cacheKey: string;
    data: PublicLeaderboardResponse | null;
  }>(() => ({
    cacheKey,
    data: cachedData,
  }));
  const [loadingKey, setLoadingKey] = useState<string | null>(
    cachedData ? null : cacheKey,
  );
  const [errorState, setErrorState] = useState<{
    cacheKey: string;
    message: string;
  }>({ cacheKey, message: '' });
  const [selectedEntry, setSelectedEntry] =
    useState<PublicLeaderboardEntry | null>(null);
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactVisible, setImpactVisible] = useState(false);
  const [impactClosing, setImpactClosing] = useState(false);
  const impactCloseTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const t = LEADERBOARD_COPY[locale];
  const movementCopy = getLeaderboardMovementCopy(locale);

  const data =
    dataState.cacheKey === cacheKey
      ? dataState.data
      : cachedData;
  const loading =
    loadingKey === cacheKey ||
    (dataState.cacheKey !== cacheKey && !cachedData);
  const error =
    errorState.cacheKey === cacheKey
      ? errorState.message
      : '';

  const load = useCallback(async (force = false) => {
    if (previewData) {
      setDataState({ cacheKey, data: previewData });
      setLoadingKey(null);
      setErrorState({ cacheKey, message: '' });
      return;
    }

    const cached = getCachedPublicLeaderboard(wallet);
    if (cached) {
      setDataState({ cacheKey, data: cached });
      setLoadingKey(null);
    } else {
      setLoadingKey(cacheKey);
    }
    setErrorState({ cacheKey, message: '' });

    try {
      const result = await loadPublicLeaderboard(wallet, { force });
      setDataState({ cacheKey, data: result });
    } catch {
      setErrorState({ cacheKey, message: t.loadError });
    } finally {
      setLoadingKey((current) =>
        current === cacheKey ? null : current,
      );
    }
  }, [cacheKey, previewData, t.loadError, wallet]);

  useEffect(() => {
    if (impactCloseTimerRef.current !== null) {
      window.clearTimeout(impactCloseTimerRef.current);
      impactCloseTimerRef.current = null;
    }
    setSelectedEntry(null);
    setImpactVisible(false);
    setImpactClosing(false);
    setImpactOpen(false);
    void load(false);
  }, [load]);

  useEffect(() => () => {
    if (impactCloseTimerRef.current !== null) {
      window.clearTimeout(impactCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!impactOpen || impactClosing) return;

    let revealFrame: number | null = null;
    const mountFrame = window.requestAnimationFrame(() => {
      revealFrame = window.requestAnimationFrame(() => {
        setImpactVisible(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(mountFrame);
      if (revealFrame !== null) {
        window.cancelAnimationFrame(revealFrame);
      }
    };
  }, [impactClosing, impactOpen]);

  useEffect(() => {
    if (!impactOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior =
      document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [impactOpen]);

  const closeImpactDetails = useCallback(() => {
    if (!impactOpen || impactCloseTimerRef.current !== null) {
      return;
    }

    setImpactClosing(true);
    setImpactVisible(false);
    impactCloseTimerRef.current = window.setTimeout(() => {
      impactCloseTimerRef.current = null;
      setImpactOpen(false);
      setImpactClosing(false);
      window.requestAnimationFrame(() => openerRef.current?.focus());
    }, softFocusCloseDelay());
  }, [impactOpen]);

  const closeDialog = useCallback(() => {
    if (impactOpen) {
      closeImpactDetails();
      return;
    }

    setSelectedEntry(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }, [closeImpactDetails, impactOpen]);

  const openWalletDetails = (
    entry: PublicLeaderboardEntry,
    opener: HTMLElement,
  ) => {
    if (impactCloseTimerRef.current !== null) {
      window.clearTimeout(impactCloseTimerRef.current);
      impactCloseTimerRef.current = null;
    }
    openerRef.current = opener;
    setImpactVisible(false);
    setImpactClosing(false);
    setImpactOpen(false);
    setSelectedEntry(entry);
  };

  const openImpactDetails = (opener: HTMLElement) => {
    if (impactOpen) return;
    openerRef.current = opener;
    setSelectedEntry(null);
    setImpactVisible(false);
    setImpactClosing(false);
    setImpactOpen(true);
  };

  useEffect(() => {
    if (!selectedEntry && !impactOpen) return;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length < 1) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedEntry, impactOpen, closeDialog]);

  const displayedLeaders = useMemo(
    () => data?.leaders.slice(0, PUBLIC_RANK_LIMIT) ?? [],
    [data],
  );
  const rankedCurrentUser = data?.currentUser ?? null;
  const currentUser: PublicLeaderboardEntry | null =
    rankedCurrentUser ??
    (wallet && !loading
      ? {
          rank: 0,
          walletAddress: wallet,
          completedReferrals: 0,
          totalRewardWei: '0',
          isCurrentWallet: true,
          previousRank: null,
          rankChange: null,
          rankMovement: 'UNAVAILABLE',
        }
      : null);
  const leadersByRank = useMemo(() => {
    const map = new Map<number, PublicLeaderboardEntry>();
    for (const entry of displayedLeaders) {
      if (entry.rank >= 1 && entry.rank <= PUBLIC_RANK_LIMIT) {
        map.set(entry.rank, entry);
      }
    }
    if (
      rankedCurrentUser &&
      rankedCurrentUser.rank >= 1 &&
      rankedCurrentUser.rank <= PUBLIC_RANK_LIMIT &&
      !map.has(rankedCurrentUser.rank)
    ) {
      map.set(rankedCurrentUser.rank, rankedCurrentUser);
    }
    return map;
  }, [displayedLeaders, rankedCurrentUser]);
  const currentUserInList = currentUser
    ? currentUser.rank >= 1 &&
      currentUser.rank <= PUBLIC_RANK_LIMIT &&
      leadersByRank.get(currentUser.rank)?.walletAddress.toLowerCase() ===
        currentUser.walletAddress.toLowerCase()
    : false;
  const trailingCurrentUser =
    currentUser && !currentUserInList ? currentUser : null;
  const totalUsers = data?.impact.totalActivatedUsers ?? 0;

  const movementAria = (entry: PublicLeaderboardEntry): string | null => {
    if (entry.rankMovement === 'NEW') {
      return movementCopy.newEntryAria;
    }
    if (entry.rankMovement === 'SAME') {
      return movementCopy.same;
    }
    if (
      entry.rankMovement === 'UP' &&
      entry.rankChange !== null &&
      entry.rankChange > 0
    ) {
      return movementCopy.up(entry.rankChange);
    }
    if (
      entry.rankMovement === 'DOWN' &&
      entry.rankChange !== null &&
      entry.rankChange < 0
    ) {
      return movementCopy.down(Math.abs(entry.rankChange));
    }
    return null;
  };

  const renderMovement = (entry: PublicLeaderboardEntry) => {
    if (
      entry.rankMovement === 'UNAVAILABLE' ||
      entry.rankMovement === 'SAME'
    ) {
      return null;
    }

    if (entry.rankMovement === 'NEW') {
      return (
        <small
          className="rankMovement new"
          dir="auto"
          aria-hidden="true"
        >
          {movementCopy.newEntry}
        </small>
      );
    }

    const change = entry.rankChange;
    if (change === null || change === 0) return null;
    const isUp = entry.rankMovement === 'UP' && change > 0;
    const isDown = entry.rankMovement === 'DOWN' && change < 0;
    if (!isUp && !isDown) return null;

    return (
      <small
        className={`rankMovement ${isUp ? 'up' : 'down'}`}
        aria-hidden="true"
      >
        <bdi dir="ltr">
          {isUp ? '▲' : '▼'}{Math.abs(change).toLocaleString('en-US')}
        </bdi>
      </small>
    );
  };

  const renderRankRow = (
    entry: PublicLeaderboardEntry,
    trailing = false,
  ) => {
    const classes = [
      'rankRow',
      entry.rank > 0 && entry.rank <= 5 ? 'featured' : 'compact',
      entry.isCurrentWallet ? 'current' : '',
      trailing ? 'trailingCurrent' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const movementDescription = movementAria(entry);

    return (
      <button
        key={entry.walletAddress}
        type="button"
        className={classes}
        data-rank={entry.rank > 0 ? entry.rank : undefined}
        onClick={(event) =>
          openWalletDetails(entry, event.currentTarget)
        }
        aria-label={[
          t.openWallet(entry.walletAddress),
          movementDescription,
        ].filter(Boolean).join('. ')}
      >
        <span className="rankStack">
          <strong className="rankValue">
            {rankLabel(entry.rank)}
          </strong>
          {renderMovement(entry)}
        </span>
        <span className="walletCell">
          <WalletAvatar address={entry.walletAddress} />
          <span className="walletText">
            {maskWallet(entry.walletAddress)}
          </span>
        </span>
        <span className="rankMetric completedMetric">
          <b>{entry.completedReferrals}</b>
        </span>
        <span className="rankMetric rewardMetric">
          <b>{formatRewardWei(entry.totalRewardWei)}</b>
        </span>
      </button>
    );
  };

  const renderPlaceholderRow = (rank: number) => (
    <div
      key={`rank-placeholder-${rank}`}
      className={`rankRow placeholderRow ${rank <= 5 ? 'featured' : 'compact'}`}
      data-rank={rank}
      aria-hidden="true"
    >
      <span className="rankStack">
        <strong className="rankValue">{rankLabel(rank)}</strong>
      </span>
      <span className="walletCell">
        <span className="walletText">—</span>
      </span>
      <span className="rankMetric completedMetric">
        <b>—</b>
      </span>
      <span className="rankMetric rewardMetric">
        <b>—</b>
      </span>
    </div>
  );

  const renderSlot = (rank: number) => {
    const entry = leadersByRank.get(rank);
    return entry ? renderRankRow(entry) : renderPlaceholderRow(rank);
  };

  return (
    <section
      className="leaderboardPage"
      aria-busy={loading}
      data-leaderboard-refreshing={loading ? 'true' : undefined}
    >
      <section
        className="impactCard"
        data-reward-forecast-preview={previewData ? 'true' : undefined}
      >
        <h2>{t.impactTitle}</h2>
        <button
          type="button"
          className="impactSummaryButton"
          disabled={!data}
          onClick={(event) => openImpactDetails(event.currentTarget)}
          aria-label={
            data
              ? `${t.impactTitle}: ${totalUsers.toLocaleString()}`
              : t.loading
          }
        >
          <span>{t.totalUsers}</span>
          <strong>{data ? totalUsers.toLocaleString() : '—'}</strong>
          <b aria-hidden="true">›</b>
        </button>
        <p className="impactNote">{t.impactNote}</p>
      </section>

      <section className="rankingCard">
        <div className="rankingTopline">
          <span>TOP {PUBLIC_RANK_LIMIT}</span>
        </div>

        <div className="tableHeader" aria-hidden="true">
          <span dir="auto">{t.rank}</span>
          <span dir="auto">{t.wallet}</span>
          <span dir="auto">{t.completed}</span>
          <span className="rewardHeader" dir="auto">
            {t.earned} <bdi dir="ltr">(B3TR)</bdi>
          </span>
        </div>

        <div className="rankScroll" aria-label={`1-${PUBLIC_RANK_LIMIT}`}>
          <div className="rows">
            {RANK_SLOTS.map((rank) => renderSlot(rank))}
          </div>
        </div>

        {trailingCurrentUser ? (
          <>
            <div className="rankDivider" aria-hidden="true">
              <span>⋮</span>
            </div>
            {renderRankRow(trailingCurrentUser, true)}
          </>
        ) : null}

        {!wallet ? (
          <p className="rankContextNote">{t.connectForRank}</p>
        ) : !rankedCurrentUser && !loading ? (
          <p className="rankContextNote">{t.unranked}</p>
        ) : null}
      </section>

      {error ? (
        <div className="leaderboardInlineError" role="status">
          <span>{error}</span>
          <button type="button" onClick={() => void load(true)}>
            {t.retry}
          </button>
        </div>
      ) : null}

      {impactOpen ? (
        <div
          className="modalBackdrop impactModalBackdrop veinviteSoftFocusBackdrop"
          data-open={impactVisible ? 'true' : 'false'}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            ref={dialogRef}
            className="walletDialog impactDialog veinviteSoftFocusPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="impact-dialog-title"
          >
            <div className="dialogTop">
              <div>
                <small>{t.totalUsers}</small>
                <h2 id="impact-dialog-title">{t.impactTitle}</h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="closeButton"
                onClick={closeDialog}
                aria-label={t.close}
              >
                ×
              </button>
            </div>

            <div className="impactBreakdown">
              <span>
                <small>{t.newUsers}</small>
                <strong>{(data?.impact.newUsers ?? 0).toLocaleString()}</strong>
              </span>
              <span>
                <small>{t.returningUsers}</small>
                <strong>
                  {(data?.impact.returningUsers ?? 0).toLocaleString()}
                </strong>
              </span>
            </div>
            {data?.reportingStartRound ? (
              <small className="reportingSince">
                {t.reportingSince(data.reportingStartRound)}
              </small>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedEntry ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            ref={dialogRef}
            className="walletDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-dialog-title"
          >
            <div className="dialogTop">
              <div>
                <small>{t.walletDetails}</small>
                <h2 id="wallet-dialog-title">
                  {rankLabel(selectedEntry.rank)}{' '}
                  {maskWallet(selectedEntry.walletAddress)}
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="closeButton"
                onClick={closeDialog}
                aria-label={t.close}
              >
                ×
              </button>
            </div>

            <label>{t.fullAddress}</label>
            <code>{selectedEntry.walletAddress}</code>
            <div className="dialogStats">
              <span>
                <small>{t.completed}</small>
                <strong>{selectedEntry.completedReferrals}</strong>
              </span>
              <span>
                <small>{t.earned}</small>
                <strong>
                  {formatRewardWei(selectedEntry.totalRewardWei)} B3TR
                </strong>
              </span>
            </div>
            <a
              href={getVeChainExplorerAddressUrl(
                selectedEntry.walletAddress,
                data?.network,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.viewExplorer}
              <span aria-hidden="true">↗</span>
            </a>
            <p>{t.explorerNote}</p>
          </div>
        </div>
      ) : null}

      <style>{SOFT_FOCUS_MOTION_CSS}</style>
      <style jsx>{`
        .leaderboardPage {
          width:min(100%,520px);
          margin:0 auto;
          padding-bottom:12px;
        }
        .impactCard,.rankingCard {
          margin-top:18px;
          padding:18px;
          border:1px solid rgba(255,205,80,.14);
          border-radius:21px;
          background:rgba(255,255,255,.035);
        }
        .impactCard {
          margin-top:0;
        }
        h2 {
          margin:0;
          font-size:1rem;
          letter-spacing:-.02em;
        }
        .impactSummaryButton {
          width:100%;
          min-height:104px;
          margin-top:14px;
          padding:16px 18px;
          display:grid;
          grid-template-columns:1fr auto;
          grid-template-rows:auto 1fr;
          align-items:center;
          gap:4px 12px;
          border:1px solid rgba(255,205,80,.16);
          border-radius:17px;
          background:linear-gradient(135deg,rgba(244,183,40,.11),rgba(255,255,255,.025));
          color:#f8f4e8;
          text-align:left;
          cursor:pointer;
          transform-origin:center;
          transition:
            border-color 120ms ease-out,
            box-shadow 120ms ease-out,
            transform 80ms ease-out;
        }
        .impactSummaryButton:hover,.impactSummaryButton:focus-visible {
          border-color:rgba(255,205,80,.4);
          outline:none;
          box-shadow:0 0 0 3px rgba(244,183,40,.08);
        }
        .impactSummaryButton:active:not(:disabled) {
          transform:scale(.985);
        }
        .impactSummaryButton:disabled {
          cursor:default;
          opacity:.72;
        }
        .impactSummaryButton:disabled:hover {
          border-color:rgba(255,205,80,.16);
          box-shadow:none;
        }
        .impactSummaryButton span {
          color:#928c80;
          font-size:.7rem;
          font-weight:850;
        }
        .impactSummaryButton strong {
          grid-row:2;
          color:#ffd35c;
          font-size:2rem;
          line-height:1;
          font-variant-numeric:tabular-nums;
        }
        .impactSummaryButton b {
          grid-column:2;
          grid-row:1 / span 2;
          color:#d9b956;
          font-size:1.55rem;
          font-weight:500;
        }
        .impactNote {
          margin:11px 2px 0;
          color:#817c73;
          font-size:.7rem;
          line-height:1.5;
          overflow-wrap:anywhere;
        }
        .rankingTopline {
          display:none;
        }
        .rankingCard {
          --rank-column:50px;
          --completed-column:86px;
          --reward-column:112px;
          --leaderboard-gap:10px;
          --rank-row-height:50px;
          padding:14px 14px 12px;
        }
        .tableHeader,.rankRow {
          width:100%;
          min-width:0;
          display:grid;
          grid-template-columns:
            var(--rank-column)
            minmax(0,1fr)
            var(--completed-column)
            var(--reward-column);
          column-gap:var(--leaderboard-gap);
          align-items:center;
          box-sizing:border-box;
          direction:ltr;
        }
        .tableHeader {
          min-height:34px;
          margin-bottom:8px;
          padding:0 12px 9px;
          border-bottom:1px solid rgba(255,205,80,.09);
          color:#777269;
          font-size:.61rem;
          font-weight:900;
        }
        .tableHeader span {
          min-width:0;
          line-height:1.2;
          overflow-wrap:anywhere;
          text-align:center;
        }
        .tableHeader .rewardHeader {
          display:flex;
          align-items:center;
          justify-content:flex-end;
          flex-wrap:wrap;
          gap:0 .22em;
          text-align:right;
        }
        .tableHeader .rewardHeader bdi {
          direction:ltr;
          unicode-bidi:isolate;
          white-space:nowrap;
        }
        .rows {
          width:100%;
          display:grid;
          gap:0;
        }
        .rankScroll {
          width:100%;
          max-height:calc(var(--rank-row-height) * 5);
          overflow-y:auto;
          overscroll-behavior:contain;
          scrollbar-gutter:stable;
          scrollbar-width:thin;
          scrollbar-color:rgba(244,183,40,.45) transparent;
        }
        .rankScroll::-webkit-scrollbar {
          width:5px;
        }
        .rankScroll::-webkit-scrollbar-track {
          background:transparent;
        }
        .rankScroll::-webkit-scrollbar-thumb {
          border-radius:999px;
          background:rgba(244,183,40,.45);
        }
        .leaderboardPage .rankRow,
        .leaderboardPage .rankRow.featured,
        .leaderboardPage .rankRow.compact {
          height:var(--rank-row-height) !important;
          min-height:var(--rank-row-height) !important;
          max-height:var(--rank-row-height) !important;
          padding:0 12px;
          border:0;
          border-bottom:1px solid rgba(255,255,255,.055);
          border-radius:0;
          background:transparent;
          color:#e9e5dc;
          font:inherit;
          line-height:1 !important;
          cursor:pointer;
        }
        .placeholderRow {
          cursor:default;
        }
        .placeholderRow:hover {
          background:transparent;
        }
        .placeholderRow .walletText,
        .placeholderRow .rankMetric b {
          color:#68645d;
          font-weight:700;
        }
        .leaderboardPage .rankRow.trailingCurrent {
          height:54px !important;
          min-height:54px !important;
          max-height:54px !important;
        }
        .rankRow:hover,.rankRow:focus-visible {
          background:rgba(255,205,80,.045);
          outline:none;
        }
        .rankRow:focus-visible {
          box-shadow:inset 0 0 0 1px rgba(255,205,80,.38);
        }
        .rankRow.current {
          background:linear-gradient(135deg,rgba(244,183,40,.10),rgba(244,183,40,.025));
          box-shadow:inset 3px 0 0 rgba(255,203,66,.72);
        }
        .rankRow.current .rankValue,
        .rankRow.current .rankMetric b {
          color:#ffd45f;
        }
        .rankStack {
          grid-column:1;
          min-width:0;
          height:100%;
          min-height:0;
          align-self:stretch;
          position:relative;
          isolation:isolate;
          overflow:visible;
          direction:ltr;
          text-align:center;
        }
        .rankValue {
          min-width:0;
          position:absolute;
          inset:0;
          z-index:2;
          width:100%;
          height:100%;
          margin:0;
          padding:0;
          display:grid;
          place-items:center;
          transform:none;
          color:#f0ede6;
          font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;
          font-size:.74rem;
          font-weight:850;
          line-height:1 !important;
          font-variant-numeric:tabular-nums;
          direction:ltr;
          text-align:center;
          text-wrap:nowrap;
          white-space:nowrap;
        }
        .rankRow[data-rank='1'] .rankStack {
          --podium-accent:#f1bd34;
          --podium-opacity:.98;
        }
        .rankRow[data-rank='2'] .rankStack {
          --podium-accent:#c8cbd0;
          --podium-opacity:.90;
        }
        .rankRow[data-rank='3'] .rankStack {
          --podium-accent:#c98252;
          --podium-opacity:.90;
        }
        .rankRow[data-rank='1'] .rankValue,
        .rankRow[data-rank='2'] .rankValue,
        .rankRow[data-rank='3'] .rankValue {
          color:var(--podium-accent);
          font-weight:950;
        }
        .rankRow[data-rank='1'] .rankStack::before,
        .rankRow[data-rank='2'] .rankStack::before,
        .rankRow[data-rank='3'] .rankStack::before {
          content:'';
          position:absolute;
          z-index:1;
          left:50%;
          top:46%;
          width:34px;
          height:27px;
          box-sizing:border-box;
          border-left:1.35px solid var(--podium-accent);
          border-right:1.35px solid var(--podium-accent);
          border-bottom:1.35px solid var(--podium-accent);
          border-radius:0 0 49% 49%;
          background:
            radial-gradient(ellipse 4px 2.1px at 14% 73%,var(--podium-accent) 0 72%,transparent 77%),
            radial-gradient(ellipse 4px 2.1px at 9% 53%,var(--podium-accent) 0 72%,transparent 77%),
            radial-gradient(ellipse 4px 2.1px at 15% 33%,var(--podium-accent) 0 72%,transparent 77%),
            radial-gradient(ellipse 4px 2.1px at 25% 16%,var(--podium-accent) 0 72%,transparent 77%),
            radial-gradient(ellipse 4px 2.1px at 86% 73%,var(--podium-accent) 0 72%,transparent 77%),
            radial-gradient(ellipse 4px 2.1px at 91% 53%,var(--podium-accent) 0 72%,transparent 77%),
            radial-gradient(ellipse 4px 2.1px at 85% 33%,var(--podium-accent) 0 72%,transparent 77%),
            radial-gradient(ellipse 4px 2.1px at 75% 16%,var(--podium-accent) 0 72%,transparent 77%);
          opacity:var(--podium-opacity);
          transform:translate(-50%,-50%);
          transform-origin:50% 50%;
          filter:drop-shadow(0 0 1px rgba(255,255,255,.12));
          pointer-events:none;
        }
        .rankRow[data-rank='1'] .rankStack::after {
          content:'';
          position:absolute;
          z-index:1;
          left:50%;
          top:3px;
          width:12px;
          height:7px;
          border-radius:1px;
          background:linear-gradient(135deg,#fff2a6 0%,#f8c64a 36%,#d89720 70%,#ffe17a 100%);
          clip-path:polygon(0 100%,0 42%,18% 64%,34% 8%,50% 59%,68% 7%,83% 64%,100% 40%,100% 100%);
          transform:translateX(-50%);
          transform-origin:50% 50%;
          filter:drop-shadow(0 0 1px rgba(241,189,52,.3));
          pointer-events:none;
        }
        .rankMovement {
          width:100%;
          max-width:none;
          position:absolute;
          z-index:3;
          left:0;
          right:0;
          bottom:4px;
          margin:0;
          padding:0;
          transform:none;
          overflow:hidden;
          color:#8f8a80;
          font-size:.52rem;
          font-weight:950;
          line-height:1 !important;
          letter-spacing:-.03em;
          text-align:center;
          text-overflow:ellipsis;
          white-space:nowrap;
          font-variant-numeric:tabular-nums;
        }
        .rankMovement.up { color:#9bcfa7; }
        .rankMovement.down { color:#cba1a1; }
        .rankMovement.new { color:#e8bd4b; }
        .rankMovement.same { color:#7f7a72; }
        .walletCell {
          grid-column:2;
          min-width:0;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:7px;
          overflow:hidden;
          color:#bcb6aa;
          font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
          font-size:.72rem;
          line-height:1.2;
          direction:ltr;
          text-align:center;
        }
        .walletAvatar {
          flex:0 0 22px;
          width:22px;
          height:22px;
          overflow:hidden;
          border:1px solid rgba(255,205,80,.22);
          border-radius:50%;
          background:
            radial-gradient(circle at 50% 35%,#eec04c 0 20%,transparent 22%),
            radial-gradient(ellipse at 50% 82%,#eec04c 0 31%,transparent 33%),
            #242116;
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.025);
        }
        .walletText {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .rankMetric {
          min-width:0;
          display:flex;
          align-items:center;
          justify-content:center;
          direction:ltr;
          text-align:center;
        }
        .completedMetric {
          grid-column:3;
        }
        .rewardMetric {
          grid-column:4;
          justify-content:flex-end;
          text-align:right;
        }
        .rankMetric b {
          min-width:0;
          color:#e9e5dc;
          font-size:.72rem;
          font-weight:850;
          line-height:1;
          font-variant-numeric:tabular-nums;
          white-space:nowrap;
        }
        .rewardMetric b {
          width:100%;
          text-align:right;
        }
        .rankDivider {
          min-height:28px;
          display:grid;
          place-items:center;
          padding:3px 0 1px;
          color:#7d786f;
          font-size:1.2rem;
          line-height:1;
          letter-spacing:0;
        }
        .rankDivider::before,.rankDivider::after {
          display:none;
        }
        .rankContextNote,.empty {
          margin:10px 0 0;
          color:#827e76;
          font-size:.7rem;
          line-height:1.45;
          text-align:center;
        }
        .leaderboardInlineError {
          margin-top:12px;
          padding:10px 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:10px;
          border:1px solid rgba(255,116,116,.16);
          border-radius:14px;
          background:rgba(150,45,45,.08);
          color:#b99595;
          font-size:.7rem;
          line-height:1.4;
          text-align:center;
        }
        .leaderboardInlineError button {
          flex:0 0 auto;
          min-height:34px;
          padding:0 10px;
          border:1px solid rgba(255,205,80,.22);
          border-radius:10px;
          background:rgba(244,183,40,.08);
          color:#e7c86d;
          font:inherit;
          font-weight:850;
          cursor:pointer;
        }
        .modalBackdrop {
          position:fixed;
          z-index:120;
          inset:0;
          display:grid;
          place-items:center;
          padding:16px;
          background:rgba(2,3,8,.82);
          backdrop-filter:blur(10px);
        }
        .impactModalBackdrop {
          overscroll-behavior:contain;
        }
        .walletDialog {
          width:min(100%,460px);
          max-height:min(82svh,720px);
          overflow:auto;
          box-sizing:border-box;
          padding:20px;
          border:1px solid rgba(255,205,80,.22);
          border-radius:24px;
          background:#11120f;
          box-shadow:0 28px 90px rgba(0,0,0,.55);
        }
        .impactDialog {
          overscroll-behavior:contain;
          -webkit-overflow-scrolling:touch;
        }
        .dialogTop {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
        }
        .dialogTop small {
          color:#f4bd35;
          font-size:.68rem;
          font-weight:900;
          letter-spacing:.08em;
        }
        .dialogTop h2 {
          margin-top:5px;
        }
        .closeButton {
          flex:0 0 auto;
          width:42px;
          height:42px;
          border:1px solid rgba(255,255,255,.1);
          border-radius:13px;
          background:rgba(255,255,255,.04);
          color:#fff;
          font-size:1.3rem;
          cursor:pointer;
        }
        .walletDialog > label {
          display:block;
          margin-top:18px;
          color:#817d74;
          font-size:.68rem;
          font-weight:800;
        }
        .walletDialog code {
          display:block;
          margin-top:7px;
          padding:12px;
          border-radius:13px;
          background:#080906;
          color:#e9c457;
          font-size:.7rem;
          line-height:1.5;
          overflow-wrap:anywhere;
        }
        .dialogStats,.impactBreakdown {
          margin-top:14px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px;
        }
        .dialogStats span,.impactBreakdown span {
          min-width:0;
          padding:12px;
          display:grid;
          gap:5px;
          border:1px solid rgba(255,255,255,.06);
          border-radius:13px;
          background:rgba(255,255,255,.025);
        }
        .dialogStats small,.impactBreakdown small {
          color:#7e796f;
          font-size:.64rem;
        }
        .dialogStats strong,.impactBreakdown strong {
          font-size:.86rem;
          font-variant-numeric:tabular-nums;
        }
        .impactBreakdown strong {
          color:#ffd35c;
          font-size:1.35rem;
        }
        .reportingSince {
          display:block;
          margin-top:12px;
          color:#706c65;
          font-size:.65rem;
        }
        .walletDialog :global(a) {
          min-height:50px;
          margin-top:14px;
          padding:0 15px;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          border-radius:15px;
          background:linear-gradient(135deg,#ffd24d,#efa718);
          color:#17120a;
          font-size:.82rem;
          font-weight:950;
          text-decoration:none;
          text-align:center;
        }
        .walletDialog > p {
          margin:9px 0 0;
          text-align:center;
          color:#777269;
          font-size:.66rem;
        }
        @media (max-width:420px) {
          .impactCard,.rankingCard {
            padding:15px;
            border-radius:19px;
          }
          .rankingCard {
            --rank-column:40px;
            --completed-column:62px;
            --reward-column:90px;
            --leaderboard-gap:5px;
            --rank-row-height:46px;
            padding:12px 12px 10px;
          }
          .tableHeader {
            min-height:32px;
            margin-bottom:6px;
            padding:0 8px 8px;
            font-size:.52rem;
          }
          .leaderboardPage .rankRow,
          .leaderboardPage .rankRow.featured,
          .leaderboardPage .rankRow.compact {
            padding-left:8px;
            padding-right:8px;
          }
          .leaderboardPage .rankRow.trailingCurrent {
            height:50px !important;
            min-height:50px !important;
            max-height:50px !important;
          }
          .rankValue,.rankMetric b {
            font-size:.65rem;
          }
          .rankRow[data-rank='1'] .rankStack::before,
          .rankRow[data-rank='2'] .rankStack::before,
          .rankRow[data-rank='3'] .rankStack::before {
            width:31px;
            height:25px;
          }
          .rankRow[data-rank='1'] .rankStack::after {
            top:2px;
            width:11px;
            height:6px;
          }
          .rankMovement {
            bottom:3px;
            font-size:.46rem;
          }
          .walletCell {
            gap:5px;
            font-size:.64rem;
          }
          .walletAvatar {
            flex-basis:18px;
            width:18px;
            height:18px;
          }
          .impactBreakdown {
            grid-template-columns:1fr;
          }
          .walletDialog {
            padding:18px;
            border-radius:21px;
          }
          .leaderboardInlineError {
            align-items:stretch;
            flex-direction:column;
          }
        }
        @media (max-width:360px) {
          .rankingCard {
            --rank-column:38px;
            --completed-column:58px;
            --reward-column:86px;
            --leaderboard-gap:4px;
            --rank-row-height:44px;
          }
          .tableHeader {
            padding-left:6px;
            padding-right:6px;
            font-size:.48rem;
          }
          .leaderboardPage .rankRow,
          .leaderboardPage .rankRow.featured,
          .leaderboardPage .rankRow.compact {
            padding-left:6px;
            padding-right:6px;
          }
          .rankValue,.rankMetric b {
            font-size:.61rem;
          }
          .rankRow[data-rank='1'] .rankStack::before,
          .rankRow[data-rank='2'] .rankStack::before,
          .rankRow[data-rank='3'] .rankStack::before {
            width:29px;
            height:23px;
          }
          .rankRow[data-rank='1'] .rankStack::after {
            top:2px;
            width:10px;
            height:6px;
          }
          .rankMovement {
            bottom:3px;
            font-size:.43rem;
          }
          .walletCell {
            gap:4px;
            font-size:.59rem;
          }
          .walletAvatar {
            flex-basis:16px;
            width:16px;
            height:16px;
          }
        }
        @media (prefers-reduced-motion:reduce) {
          .impactSummaryButton {
            transition:none;
          }
          .impactSummaryButton:active:not(:disabled) {
            transform:none;
          }
        }
      `}</style>
    </section>
  );
}
